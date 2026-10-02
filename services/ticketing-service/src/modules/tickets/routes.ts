import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { authenticate, requireRole, validate, HttpError } from "@helpdesk/common";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { ROLES, NOTIFICATION_TYPES } from "../../config/constants.js";
import { logAudit } from "../../lib/audit.js";
import { generateTicketNumber } from "../../lib/ticket-number.js";
import { computeSlaDates, ticketSlaIndicator } from "../../lib/sla.js";
import { getMe, lookupUser, lookupUsers } from "../../lib/identity-client.js";
import { getCategories, getPriorities } from "../../lib/catalog-client.js";
import { enrichTicket, enrichTickets, buildEnrichContext } from "../../lib/enrich.js";
import { getTicketOrThrow, ALLOWED_TRANSITIONS, TECHNICIAN_MANUAL_TRANSITIONS, getStatusByCode, getStatusById, notifyRequester, notifyTechnician, notifyRole } from "./helpers.js";
import { sendTicketConfirmationEmail } from "../../lib/notifications.js";

// Adaptado desde backend/src/modules/tickets/routes.ts (981 líneas) — el módulo más grande y más
// acoplado del monolito. Cambios respecto al original, resumidos (el detalle de cada uno está en
// helpers.ts, lib/enrich.ts y los *-client.ts):
//
// 1) Ningún `include` de Prisma trae usuario/categoría/prioridad/estado/empresa/depto — esos datos
//    viven en otros servicios. Las respuestas se componen con lib/enrich.ts (API composition).
// 2) Toda validación que antes era un `findUnique` local (categoría, prioridad, subcategoría,
//    estado, técnico) ahora es una llamada HTTP a catalog-service / identity-service.
// 3) Adjuntos NO se portan en esta fase: attachment-service todavía no existe (Fase 7, se decidió
//    saltarla para priorizar este núcleo). `POST /:id/attachments`, `GET /:id/attachments/:fileId`
//    y la subida de archivos en creación/comentarios quedan pendientes — ver TODOs puntuales abajo.
// 4) `getTicketOrThrow` ya usa `HttpError` (bug real de Fase 0, corregido de raíz aquí).

const requireAuth = authenticate(env.JWT_SECRET);

export const ticketsRouter = Router();

ticketsRouter.use(requireAuth);

// ============================================================
// Schemas
// ============================================================

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  statusId: z.coerce.number().int().optional(),
  statusCode: z.string().max(30).optional(),
  priorityId: z.coerce.number().int().optional(),
  categoryId: z.coerce.number().int().optional(),
  technicianId: z.coerce.number().int().optional(),
  companyId: z.coerce.number().int().optional(),
  userId: z.coerce.number().int().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "ticketNumber", "priorityId", "statusId"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  sla: z.enum(["normal", "proximo", "vencido"]).optional(),
});

const createSchema = z.object({
  subject: z.string().min(3, "El asunto es obligatorio (mínimo 3 caracteres)").max(200),
  categoryId: z.coerce.number().int().positive("Selecciona una categoría"),
  subcategoryId: z.coerce.number().int().positive().optional(),
  priorityId: z.coerce.number().int().positive("Selecciona una prioridad"),
  description: z.string().min(10, "Describe el problema (mínimo 10 caracteres)").max(5000),
  location: z.string().max(200).optional(),
  device: z.string().max(200).optional(),
  inventoryNumber: z.string().max(100).optional(),
});

const commentSchema = z.object({
  comment: z.string().min(1, "El comentario no puede estar vacío").max(5000),
});

const assignSchema = z.object({
  technicianId: z.coerce.number().int().positive("Selecciona un técnico"),
  reason: z.string().max(500).optional(),
});

const statusChangeSchema = z.object({
  status: z.string().min(2).max(30),
  comment: z.string().max(1000).optional(),
});

const resolveSchema = z.object({
  problemIdentified: z.string().min(3, "Indica el problema identificado").max(1000),
  cause: z.string().max(1000).optional(),
  solutionApplied: z.string().min(3, "Indica la solución aplicada").max(2000),
  observations: z.string().max(1000).optional(),
  timeUsedMinutes: z.coerce.number().int().min(0).max(100000).optional(),
});

const reopenSchema = z.object({
  reason: z.string().min(5, "Explica el motivo de la reapertura (mínimo 5 caracteres)").max(1000),
});

const updateSchema = z.object({
  subject: z.string().min(3).max(200).optional(),
  description: z.string().min(10).max(5000).optional(),
});

// ============================================================
// GET /api/tickets — listado con filtros (alcance por rol)
// ============================================================
ticketsRouter.get("/", validate({ query: listQuerySchema }), async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;
    const user = req.user!;
    const authorization = req.headers.authorization!;

    const where: Prisma.TicketWhereInput = {};
    if (user.role === ROLES.TECNICO) {
      where.assignedTechnicianId = user.sub;
    } else if (user.role === ROLES.USUARIO) {
      where.userId = user.sub;
    }

    if (q.search) {
      const s = q.search;
      where.OR = [
        { ticketNumber: { contains: s } },
        { subject: { contains: s } },
        { requesterName: { contains: s } },
        { requesterEmail: { contains: s } },
        { device: { contains: s } },
        { inventoryNumber: { contains: s } },
        { location: { contains: s } },
      ];
    }
    if (q.statusId) where.statusId = q.statusId;
    if (q.statusCode) {
      const status = await getStatusByCode(q.statusCode, authorization);
      where.statusId = status ? status.id : -1;
    }
    if (q.priorityId) where.priorityId = q.priorityId;
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.technicianId && user.role === ROLES.MASTER) where.assignedTechnicianId = q.technicianId;
    if (q.companyId && user.role === ROLES.MASTER) where.companyId = q.companyId;
    if (q.userId && user.role === ROLES.MASTER) where.userId = q.userId;
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(q.from);
      if (q.to) where.createdAt.lte = new Date(q.to);
    }

    const orderBy = { [q.sortBy]: q.sortDir } as Prisma.TicketOrderByWithRelationInput;

    const [total, rows] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);

    let data = await enrichTickets(rows, authorization);
    if (q.sla) data = data.filter((t) => t.sla === q.sla);

    res.json({ data, total, page: q.page, pageSize: q.pageSize });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /api/tickets/export — exportación CSV (MASTER)
// ============================================================
ticketsRouter.get("/export", requireRole(ROLES.MASTER), validate({ query: listQuerySchema }), async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;
    const authorization = req.headers.authorization!;
    const where: Prisma.TicketWhereInput = {};
    if (q.search) {
      const s = q.search;
      where.OR = [
        { ticketNumber: { contains: s } },
        { subject: { contains: s } },
        { requesterName: { contains: s } },
        { requesterEmail: { contains: s } },
      ];
    }
    if (q.statusId) where.statusId = q.statusId;
    if (q.statusCode) {
      const status = await getStatusByCode(q.statusCode, authorization);
      where.statusId = status ? status.id : -1;
    }
    if (q.priorityId) where.priorityId = q.priorityId;
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.technicianId) where.assignedTechnicianId = q.technicianId;
    if (q.companyId) where.companyId = q.companyId;
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(q.from);
      if (q.to) where.createdAt.lte = new Date(q.to);
    }

    const rows = await prisma.ticket.findMany({ where, orderBy: { createdAt: "desc" } });
    const tickets = await enrichTickets(rows, authorization);

    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const header = [
      "Ticket", "Asunto", "Solicitante", "Correo", "Empresa", "Departamento",
      "Categoría", "Subcategoría", "Prioridad", "Técnico", "Estado", "Ubicación",
      "Equipo", "Inventario", "Creado", "Primera respuesta", "Resuelto", "Cerrado", "SLA",
    ].join(",");
    const lines = tickets.map((t) =>
      [
        esc(t.ticketNumber), esc(t.subject), esc(t.requesterName), esc(t.requesterEmail),
        esc(t.company?.name), esc(t.department?.name), esc(t.category?.name),
        esc(t.subcategory?.name), esc(t.priority?.name), esc(t.assignedTechnician?.name),
        esc(t.status?.name), esc(t.location), esc(t.device), esc(t.inventoryNumber),
        esc(t.createdAt.toISOString()), esc(t.firstResponseAt?.toISOString()),
        esc(t.resolvedAt?.toISOString()), esc(t.closedAt?.toISOString()),
        esc(t.sla),
      ].join(","),
    );
    const csv = "﻿" + [header, ...lines].join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="tickets-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /api/tickets — creación
// TODO (Fase 7): esta fase no incluye adjuntos en la creación — attachment-service no existe
// todavía. El monolito original aceptaba multipart con hasta 5 archivos aquí.
// ============================================================
ticketsRouter.post("/", validate({ body: createSchema }), async (req, res, next) => {
  try {
    const data = req.body as z.infer<typeof createSchema>;
    const user = req.user!;
    const authorization = req.headers.authorization!;

    const [me, categories, priorities] = await Promise.all([getMe(authorization), getCategories(authorization), getPriorities(authorization)]);

    const category = categories.find((c) => c.id === data.categoryId);
    if (!category || category.status !== "ACTIVE") throw new HttpError(400, "Categoría inválida");
    const priority = priorities.find((p) => p.id === data.priorityId);
    if (!priority || priority.status !== "ACTIVE") throw new HttpError(400, "Prioridad inválida");
    let subcategory: { id: number; name: string } | undefined;
    if (data.subcategoryId) {
      subcategory = category.subcategories.find((s) => s.id === data.subcategoryId);
      if (!subcategory) throw new HttpError(400, "Subcategoría inválida");
    }

    const statusNuevo = await getStatusByCode("NUEVO", authorization);
    if (!statusNuevo) throw new HttpError(500, "Falta el estado NUEVO en el catálogo");

    const now = new Date();
    const ticketNumber = await generateTicketNumber(prisma);
    const slaDates = priority.sla?.active ? computeSlaDates(now, priority.sla) : { slaResponseDueAt: null, slaResolutionDueAt: null };

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        userId: user.sub,
        subject: data.subject,
        categoryId: category.id,
        subcategoryId: data.subcategoryId ?? null,
        priorityId: priority.id,
        statusId: statusNuevo.id,
        description: data.description,
        location: data.location ?? null,
        device: data.device ?? null,
        inventoryNumber: data.inventoryNumber ?? null,
        requesterName: me.name,
        requesterEmail: me.email,
        requesterPhone: me.phone,
        companyId: me.companyId,
        departmentId: me.departmentId,
        slaResponseDueAt: slaDates.slaResponseDueAt,
        slaResolutionDueAt: slaDates.slaResolutionDueAt,
        createdAt: now,
      },
    });

    await prisma.ticketHistory.create({
      data: { ticketId: ticket.id, userId: user.sub, action: "CREATED", description: "Ticket creado", newValue: ticket.ticketNumber },
    });
    logAudit({
      userId: user.sub,
      action: "TICKET_CREATED",
      entityType: "TICKET",
      entityId: ticket.id,
      description: `Creó el ticket ${ticket.ticketNumber}: ${ticket.subject}`,
      req,
    });
    notifyRole(ROLES.MASTER, {
      type: NOTIFICATION_TYPES.TICKET_CREATED,
      title: "Nuevo ticket",
      message: `${ticket.ticketNumber} — ${ticket.subject} (${user.name})`,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      ticketSubject: ticket.subject,
    }, authorization);
    notifyRequester(ticket, NOTIFICATION_TYPES.TICKET_CREATED, "Ticket creado", `Tu ticket ${ticket.ticketNumber} fue registrado correctamente.`);
    sendTicketConfirmationEmail(ticket, me.email, {
      category: category.name,
      subcategory: subcategory?.name,
      priority: priority.name,
      location: ticket.location,
      device: ticket.device,
      inventoryNumber: ticket.inventoryNumber,
      description: ticket.description,
    });

    const ctx = await buildEnrichContext([ticket], authorization);
    res.status(201).json(enrichTicket(ticket, ctx));
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /api/tickets/:id — detalle
// TODO (Fase 7): no incluye `attachments` — attachment-service no existe todavía.
// ============================================================
ticketsRouter.get("/:id", async (req, res, next) => {
  try {
    const ticket = await getTicketOrThrow(Number(req.params.id), req.user!);
    const ctx = await buildEnrichContext([ticket], req.headers.authorization!);
    res.json(enrichTicket(ticket, ctx));
  } catch (err) {
    next(err);
  }
});

// ============================================================
// PATCH /api/tickets/:id — editar asunto/descripción (solicitante o MASTER)
// ============================================================
ticketsRouter.patch("/:id", validate({ body: updateSchema }), async (req, res, next) => {
  try {
    const ticket = await getTicketOrThrow(Number(req.params.id), req.user!);
    const user = req.user!;
    if (user.role !== ROLES.MASTER && ticket.userId !== user.sub) {
      throw new HttpError(403, "Solo el solicitante o el MASTER pueden editar el ticket");
    }
    const updated = await prisma.ticket.update({ where: { id: ticket.id }, data: req.body });
    await prisma.ticketHistory.create({
      data: { ticketId: ticket.id, userId: user.sub, action: "TICKET_EDITED", description: "Se editó el asunto o la descripción del ticket" },
    });
    logAudit({ userId: user.sub, action: "TICKET_EDITED", entityType: "TICKET", entityId: ticket.id, description: `Editó el ticket ${ticket.ticketNumber}`, req });
    const ctx = await buildEnrichContext([updated], req.headers.authorization!);
    res.json(enrichTicket(updated, ctx));
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /api/tickets/:id/history — línea de tiempo completa
// ============================================================
ticketsRouter.get("/:id/history", async (req, res, next) => {
  try {
    const ticket = await getTicketOrThrow(Number(req.params.id), req.user!);
    const authorization = req.headers.authorization!;
    const [histories, comments, assignments, solutions] = await Promise.all([
      prisma.ticketHistory.findMany({ where: { ticketId: ticket.id }, orderBy: { createdAt: "asc" } }),
      prisma.ticketComment.findMany({ where: { ticketId: ticket.id }, orderBy: { createdAt: "asc" } }),
      prisma.ticketAssignment.findMany({ where: { ticketId: ticket.id }, orderBy: { createdAt: "asc" } }),
      prisma.ticketSolution.findMany({ where: { ticketId: ticket.id }, orderBy: { createdAt: "asc" } }),
    ]);

    const userIds = new Set<number>();
    for (const h of histories) if (h.userId) userIds.add(h.userId);
    for (const c of comments) userIds.add(c.userId);
    for (const a of assignments) {
      userIds.add(a.assignedById);
      if (a.previousTechnicianId) userIds.add(a.previousTechnicianId);
      userIds.add(a.newTechnicianId);
    }
    for (const s of solutions) userIds.add(s.userId);
    const users = await lookupUsers([...userIds], authorization);
    const userRef = (id: number | null) => {
      if (id == null) return null;
      const u = users.find((x) => x.id === id);
      return u ? { id: u.id, name: u.name } : { id, name: "Usuario desconocido" };
    };

    interface TimelineItem {
      id: string;
      kind: string;
      title: string;
      description?: string;
      user?: { id: number; name: string } | null;
      createdAt: Date;
      meta?: Record<string, unknown>;
    }

    const items: TimelineItem[] = [
      ...histories.map((h) => ({
        id: `h-${h.id}`,
        kind: "history",
        title: historyTitle(h.action),
        description: h.description + (h.oldValue && h.newValue ? ` (${h.oldValue} → ${h.newValue})` : ""),
        user: userRef(h.userId),
        createdAt: h.createdAt,
        meta: { action: h.action, oldValue: h.oldValue, newValue: h.newValue },
      })),
      ...comments.map((c) => ({
        id: `c-${c.id}`,
        kind: "comment",
        title: "Seguimiento",
        description: c.comment,
        user: userRef(c.userId),
        createdAt: c.createdAt,
      })),
      ...assignments.map((a) => {
        const isReassign = Boolean(a.previousTechnicianId);
        const assignedBy = userRef(a.assignedById);
        const prevName = a.previousTechnicianId ? (userRef(a.previousTechnicianId)?.name ?? "—") : "—";
        const newName = userRef(a.newTechnicianId)?.name ?? "—";
        return {
          id: `a-${a.id}`,
          kind: "assignment",
          title: isReassign ? "Reasignación" : "Asignación",
          description: `${assignedBy?.name} ${isReassign ? `reasignó de ${prevName} a ${newName}` : `asignó a ${newName}`}${a.reason ? ` — Motivo: ${a.reason}` : ""}`,
          user: assignedBy,
          createdAt: a.createdAt,
          meta: { isReassign, reason: a.reason },
        };
      }),
      ...solutions.map((s) => ({
        id: `s-${s.id}`,
        kind: "solution",
        title: "Solución registrada",
        description: `${s.problemIdentified}${s.cause ? `\nCausa: ${s.cause}` : ""}\nSolución: ${s.solutionApplied}${s.observations ? `\nObservaciones: ${s.observations}` : ""}${s.timeUsedMinutes ? `\nTiempo utilizado: ${s.timeUsedMinutes} min` : ""}`,
        user: userRef(s.userId),
        createdAt: s.createdAt,
        meta: { timeUsedMinutes: s.timeUsedMinutes },
      })),
    ];

    items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    res.json(items);
  } catch (err) {
    next(err);
  }
});

function historyTitle(action: string): string {
  const map: Record<string, string> = {
    CREATED: "Ticket creado",
    ASSIGNED: "Ticket asignado",
    REASSIGNED: "Ticket reasignado",
    STATUS_CHANGED: "Cambio de estado",
    PRIORITY_CHANGED: "Cambio de prioridad",
    COMMENT_ADDED: "Comentario agregado",
    RESOLVED: "Ticket resuelto",
    CLOSED: "Ticket cerrado",
    REOPENED: "Ticket reabierto",
    CANCELED: "Ticket cancelado",
    ATTACHMENT_ADDED: "Archivo adjunto",
    TICKET_EDITED: "Ticket editado",
  };
  return map[action] ?? action;
}

// ============================================================
// POST /api/tickets/:id/comments — seguimiento
// TODO (Fase 7): no acepta adjuntos todavía (ver nota de POST / arriba).
// ============================================================
ticketsRouter.post("/:id/comments", validate({ body: commentSchema }), async (req, res, next) => {
  try {
    const ticket = await getTicketOrThrow(Number(req.params.id), req.user!);
    const user = req.user!;

    const comment = await prisma.ticketComment.create({
      data: { ticketId: ticket.id, userId: user.sub, comment: req.body.comment },
    });

    // Primera respuesta: primer comentario del soporte (técnico o MASTER)
    if (!ticket.firstResponseAt && user.role !== ROLES.USUARIO) {
      await prisma.ticket.update({ where: { id: ticket.id }, data: { firstResponseAt: new Date() } });
    }

    await prisma.ticketHistory.create({
      data: { ticketId: ticket.id, userId: user.sub, action: "COMMENT_ADDED", description: `${user.name} agregó un seguimiento` },
    });
    logAudit({ userId: user.sub, action: "COMMENT_ADDED", entityType: "TICKET", entityId: ticket.id, description: `Comentario en ${ticket.ticketNumber}`, req });

    const authorization = req.headers.authorization!;
    if (user.role === ROLES.USUARIO) {
      notifyTechnician(ticket.assignedTechnicianId, ticket, NOTIFICATION_TYPES.COMMENT_ADDED, "Comentario del usuario", `${ticket.ticketNumber}: ${user.name} agregó un comentario.`);
      notifyRole(ROLES.MASTER, {
        type: NOTIFICATION_TYPES.COMMENT_ADDED,
        title: "Comentario en ticket",
        message: `${ticket.ticketNumber}: ${user.name} agregó un comentario.`,
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        ticketSubject: ticket.subject,
      }, authorization);
    } else {
      notifyRequester(ticket, NOTIFICATION_TYPES.COMMENT_ADDED, "Nuevo seguimiento", `${ticket.ticketNumber}: ${user.name} agregó un comentario a tu ticket.`);
    }

    res.status(201).json({ ...comment, user: { id: user.sub, name: user.name } });
  } catch (err) {
    next(err);
  }
});

async function assignTicket(req: Request, res: Response, requireExistingTechnician: boolean) {
  const ticket = await getTicketOrThrow(Number(req.params.id), req.user!);
  const authorization = req.headers.authorization!;
  const { technicianId, reason } = req.body as z.infer<typeof assignSchema>;

  if (requireExistingTechnician && !ticket.assignedTechnicianId) {
    throw new HttpError(400, "El ticket no tiene un técnico asignado; usa asignar");
  }

  const technician = await lookupUser(technicianId, authorization);
  if (!technician || technician.roleCode !== ROLES.TECNICO || technician.status !== "ACTIVE") {
    throw new HttpError(400, "El técnico seleccionado no es válido");
  }

  const previousId = ticket.assignedTechnicianId ?? null;
  const previousTechnician = previousId ? await lookupUser(previousId, authorization) : null;
  const isReassign = requireExistingTechnician || (previousId !== null && previousId !== technicianId);
  const statusAsignado = await getStatusByCode("ASIGNADO", authorization);
  if (!statusAsignado) throw new HttpError(500, "Falta el estado ASIGNADO en el catálogo");

  const updated = await prisma.ticket.update({
    where: { id: ticket.id },
    data: { assignedTechnicianId: technician.id, statusId: statusAsignado.id, firstResponseAt: ticket.firstResponseAt ?? new Date() },
  });

  await prisma.ticketAssignment.create({
    data: { ticketId: ticket.id, assignedById: req.user!.sub, previousTechnicianId: previousId, newTechnicianId: technician.id, reason: reason ?? null },
  });
  await prisma.ticketHistory.create({
    data: {
      ticketId: ticket.id,
      userId: req.user!.sub,
      action: isReassign ? "REASSIGNED" : "ASSIGNED",
      description: isReassign ? `Reasignado a ${technician.name}${reason ? ` — Motivo: ${reason}` : ""}` : `Asignado a ${technician.name}`,
      oldValue: previousTechnician?.name ?? null,
      newValue: technician.name,
    },
  });
  logAudit({
    userId: req.user!.sub,
    action: isReassign ? "TICKET_REASSIGNED" : "TICKET_ASSIGNED",
    entityType: "TICKET",
    entityId: ticket.id,
    description: `${isReassign ? "Reasignó" : "Asignó"} ${ticket.ticketNumber} a ${technician.name}`,
    req,
  });

  if (isReassign) {
    notifyTechnician(previousId, ticket, NOTIFICATION_TYPES.TICKET_REASSIGNED, "Ticket reasignado", `${ticket.ticketNumber} fue reasignado a ${technician.name}.`);
  }
  notifyTechnician(technician.id, ticket, isReassign ? NOTIFICATION_TYPES.TICKET_REASSIGNED : NOTIFICATION_TYPES.TICKET_ASSIGNED, "Ticket asignado", `Te asignaron el ticket ${ticket.ticketNumber}: ${ticket.subject}.`);
  notifyRequester(ticket, NOTIFICATION_TYPES.TICKET_ASSIGNED, "Técnico asignado", `Tu ticket ${ticket.ticketNumber} fue asignado a ${technician.name}.`);

  const ctx = await buildEnrichContext([updated], authorization);
  res.json(enrichTicket(updated, ctx));
}

// POST /api/tickets/:id/assign — asignar técnico (MASTER)
ticketsRouter.post("/:id/assign", requireRole(ROLES.MASTER), validate({ body: assignSchema }), async (req, res, next) => {
  try {
    await assignTicket(req, res, false);
  } catch (err) {
    next(err);
  }
});

// POST /api/tickets/:id/reassign — reasignación (MASTER)
ticketsRouter.post("/:id/reassign", requireRole(ROLES.MASTER), validate({ body: assignSchema }), async (req, res, next) => {
  try {
    await assignTicket(req, res, true);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /api/tickets/:id/status — cambio de estado (transiciones validadas)
// ============================================================
ticketsRouter.post("/:id/status", validate({ body: statusChangeSchema }), async (req, res, next) => {
  try {
    const ticket = await getTicketOrThrow(Number(req.params.id), req.user!);
    const user = req.user!;
    const authorization = req.headers.authorization!;
    const currentStatus = await getStatusById(ticket.statusId, authorization);
    const target = await getStatusByCode(String(req.body.status), authorization);
    if (!target) throw new HttpError(400, "Estado inválido");
    if (!currentStatus) throw new HttpError(500, "No se pudo resolver el estado actual del ticket");

    const currentCode = currentStatus.code;
    const allowed = ALLOWED_TRANSITIONS[currentCode] ?? [];

    if (user.role === ROLES.USUARIO) {
      throw new HttpError(403, "El solicitante no puede cambiar estados directamente");
    }
    if (user.role === ROLES.TECNICO) {
      const techAllowed = TECHNICIAN_MANUAL_TRANSITIONS[currentCode] ?? [];
      if (!techAllowed.includes(target.code)) {
        throw new HttpError(403, "No puedes pasar de " + currentCode + " a " + target.code);
      }
    }
    if (!allowed.includes(target.code)) {
      throw new HttpError(400, `Transición no permitida: ${currentCode} → ${target.code}`);
    }

    const updated = await prisma.ticket.update({ where: { id: ticket.id }, data: { statusId: target.id } });
    await prisma.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        userId: user.sub,
        action: "STATUS_CHANGED",
        description: `${currentStatus.name} → ${target.name}${req.body.comment ? ` — ${req.body.comment}` : ""}`,
        oldValue: currentStatus.name,
        newValue: target.name,
      },
    });
    logAudit({
      userId: user.sub,
      action: "STATUS_CHANGED",
      entityType: "TICKET",
      entityId: ticket.id,
      description: `Cambió estado de ${ticket.ticketNumber}: ${currentStatus.name} → ${target.name}`,
      req,
    });
    if (user.role !== ROLES.USUARIO) {
      notifyRequester(ticket, NOTIFICATION_TYPES.STATUS_CHANGED, "Cambio de estado", `Tu ticket ${ticket.ticketNumber} cambió a: ${target.name}.`);
    }
    if (user.role === ROLES.USUARIO) {
      notifyTechnician(ticket.assignedTechnicianId, ticket, NOTIFICATION_TYPES.STATUS_CHANGED, "Cambio de estado", `${ticket.ticketNumber} cambió a: ${target.name}.`);
    }
    const ctx = await buildEnrichContext([updated], authorization);
    res.json(enrichTicket(updated, ctx));
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /api/tickets/:id/resolve — registrar solución (técnico asignado o MASTER)
// ============================================================
ticketsRouter.post("/:id/resolve", validate({ body: resolveSchema }), async (req, res, next) => {
  try {
    const ticket = await getTicketOrThrow(Number(req.params.id), req.user!);
    const user = req.user!;
    const authorization = req.headers.authorization!;
    if (user.role === ROLES.USUARIO) {
      throw new HttpError(403, "El solicitante no puede resolver tickets");
    }
    if (user.role === ROLES.TECNICO && ticket.assignedTechnicianId !== user.sub) {
      throw new HttpError(403, "Solo el técnico asignado puede resolver este ticket");
    }
    const currentStatus = await getStatusById(ticket.statusId, authorization);
    if (!currentStatus || !["ASIGNADO", "EN_PROCESO", "ESPERA_USUARIO", "REABIERTO"].includes(currentStatus.code)) {
      throw new HttpError(400, `No se puede resolver un ticket en estado ${currentStatus?.name ?? "desconocido"}`);
    }

    const statusResuelto = await getStatusByCode("RESUELTO", authorization);
    if (!statusResuelto) throw new HttpError(500, "Falta el estado RESUELTO en el catálogo");

    const [solution, updated] = await prisma.$transaction([
      prisma.ticketSolution.create({
        data: {
          ticketId: ticket.id,
          userId: user.sub,
          problemIdentified: req.body.problemIdentified,
          cause: req.body.cause ?? null,
          solutionApplied: req.body.solutionApplied,
          observations: req.body.observations ?? null,
          timeUsedMinutes: req.body.timeUsedMinutes ?? null,
        },
      }),
      prisma.ticket.update({ where: { id: ticket.id }, data: { statusId: statusResuelto.id, resolvedAt: new Date() } }),
    ]);

    await prisma.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        userId: user.sub,
        action: "RESOLVED",
        description: `Resuelto por ${user.name}: ${req.body.solutionApplied}`,
        oldValue: currentStatus.name,
        newValue: "Resuelto",
      },
    });
    logAudit({ userId: user.sub, action: "TICKET_RESOLVED", entityType: "TICKET", entityId: ticket.id, description: `Resolvió ${ticket.ticketNumber}`, req });
    notifyRequester(ticket, NOTIFICATION_TYPES.TICKET_RESOLVED, "Ticket resuelto", `Tu ticket ${ticket.ticketNumber} fue marcado como resuelto. Confirma la solución o indícanos si el problema continúa.`);

    const ctx = await buildEnrichContext([updated], authorization);
    res.json({ ...enrichTicket(updated, ctx), solution });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /api/tickets/:id/confirm — el solicitante confirma la solución (cierre)
// ============================================================
ticketsRouter.post("/:id/confirm", async (req, res, next) => {
  try {
    const ticket = await getTicketOrThrow(Number(req.params.id), req.user!);
    const user = req.user!;
    const authorization = req.headers.authorization!;
    if (user.role !== ROLES.MASTER && ticket.userId !== user.sub) {
      throw new HttpError(403, "Solo el solicitante o el MASTER pueden confirmar la solución");
    }
    const currentStatus = await getStatusById(ticket.statusId, authorization);
    if (currentStatus?.code !== "RESUELTO") {
      throw new HttpError(400, "El ticket debe estar en estado Resuelto para confirmar");
    }
    const statusCerrado = await getStatusByCode("CERRADO", authorization);
    if (!statusCerrado) throw new HttpError(500, "Falta el estado CERRADO en el catálogo");
    const updated = await prisma.ticket.update({ where: { id: ticket.id }, data: { statusId: statusCerrado.id, closedAt: new Date() } });
    await prisma.ticketHistory.create({
      data: { ticketId: ticket.id, userId: user.sub, action: "CLOSED", description: `Cerrado por ${user.name} (confirmación del solicitante)`, oldValue: "Resuelto", newValue: "Cerrado" },
    });
    logAudit({ userId: user.sub, action: "TICKET_CLOSED", entityType: "TICKET", entityId: ticket.id, description: `Cerró ${ticket.ticketNumber}`, req });
    notifyTechnician(ticket.assignedTechnicianId, ticket, NOTIFICATION_TYPES.TICKET_CLOSED, "Ticket cerrado", `${ticket.ticketNumber} fue cerrado por el usuario.`);
    const ctx = await buildEnrichContext([updated], authorization);
    res.json(enrichTicket(updated, ctx));
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /api/tickets/:id/resend-confirmation — reenvía el correo de confirmación del ticket
// (mismo evento "email.send" que se dispara al crearlo). Existe para poder generar varios
// trabajos de email.send sobre el MISMO ticket sin tener que crear tickets nuevos — útil para
// probar el proveedor SMTP real o para seguir demostrando el patrón de reintentos/DLQ.
// ============================================================
ticketsRouter.post("/:id/resend-confirmation", async (req, res, next) => {
  try {
    const ticket = await getTicketOrThrow(Number(req.params.id), req.user!);
    const user = req.user!;
    if (user.role !== ROLES.MASTER && ticket.userId !== user.sub) {
      throw new HttpError(403, "Solo el solicitante o el MASTER pueden reenviar la confirmación");
    }
    await sendTicketConfirmationEmail(ticket, ticket.requesterEmail);
    logAudit({ userId: user.sub, action: "TICKET_EMAIL_RESENT", entityType: "TICKET", entityId: ticket.id, description: `Reenvió la confirmación por correo de ${ticket.ticketNumber}`, req });
    res.json({ ok: true, to: ticket.requesterEmail });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /api/tickets/:id/reopen — reapertura con motivo (vuelve a bandeja MASTER)
// ============================================================
ticketsRouter.post("/:id/reopen", validate({ body: reopenSchema }), async (req, res, next) => {
  try {
    const ticket = await getTicketOrThrow(Number(req.params.id), req.user!);
    const user = req.user!;
    const authorization = req.headers.authorization!;
    if (user.role !== ROLES.MASTER && ticket.userId !== user.sub) {
      throw new HttpError(403, "Solo el solicitante o el MASTER pueden reabrir el ticket");
    }
    const currentStatus = await getStatusById(ticket.statusId, authorization);
    if (!currentStatus || !["RESUELTO", "CERRADO"].includes(currentStatus.code)) {
      throw new HttpError(400, "Solo se pueden reabrir tickets Resueltos o Cerrados");
    }
    const statusReabierto = await getStatusByCode("REABIERTO", authorization);
    if (!statusReabierto) throw new HttpError(500, "Falta el estado REABIERTO en el catálogo");
    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { statusId: statusReabierto.id, reopenedCount: { increment: 1 }, resolvedAt: null, closedAt: null },
    });
    await prisma.ticketHistory.create({
      data: { ticketId: ticket.id, userId: user.sub, action: "REOPENED", description: `Reabierto por ${user.name} — Motivo: ${req.body.reason}`, oldValue: currentStatus.name, newValue: "Reabierto" },
    });
    logAudit({ userId: user.sub, action: "TICKET_REOPENED", entityType: "TICKET", entityId: ticket.id, description: `Reabrió ${ticket.ticketNumber}: ${req.body.reason}`, req });
    notifyRole(ROLES.MASTER, {
      type: NOTIFICATION_TYPES.TICKET_REOPENED,
      title: "Ticket reabierto",
      message: `${ticket.ticketNumber} fue reabierto por ${user.name}. Motivo: ${req.body.reason}`,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      ticketSubject: ticket.subject,
    }, authorization);
    notifyTechnician(ticket.assignedTechnicianId, ticket, NOTIFICATION_TYPES.TICKET_REOPENED, "Ticket reabierto", `${ticket.ticketNumber} fue reabierto por el usuario.`);
    const ctx = await buildEnrichContext([updated], authorization);
    res.json(enrichTicket(updated, ctx));
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /api/tickets/:id/cancel — cancelación
// ============================================================
ticketsRouter.post("/:id/cancel", async (req, res, next) => {
  try {
    const ticket = await getTicketOrThrow(Number(req.params.id), req.user!);
    const user = req.user!;
    const authorization = req.headers.authorization!;
    if (user.role !== ROLES.MASTER && ticket.userId !== user.sub) {
      throw new HttpError(403, "Solo el solicitante o el MASTER pueden cancelar el ticket");
    }
    const currentStatus = await getStatusById(ticket.statusId, authorization);
    const statusCancelado = await getStatusByCode("CANCELADO", authorization);
    if (!statusCancelado) throw new HttpError(500, "Falta el estado CANCELADO en el catálogo");
    const updated = await prisma.ticket.update({ where: { id: ticket.id }, data: { statusId: statusCancelado.id } });
    await prisma.ticketHistory.create({
      data: { ticketId: ticket.id, userId: user.sub, action: "CANCELED", description: `Cancelado por ${user.name}`, oldValue: currentStatus?.name ?? null, newValue: "Cancelado" },
    });
    logAudit({ userId: user.sub, action: "TICKET_CANCELED", entityType: "TICKET", entityId: ticket.id, description: `Canceló ${ticket.ticketNumber}`, req });
    notifyRole(ROLES.MASTER, {
      type: NOTIFICATION_TYPES.TICKET_CANCELED,
      title: "Ticket cancelado",
      message: `${ticket.ticketNumber} fue cancelado por ${user.name}.`,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      ticketSubject: ticket.subject,
    }, authorization);
    const ctx = await buildEnrichContext([updated], authorization);
    res.json(enrichTicket(updated, ctx));
  } catch (err) {
    next(err);
  }
});
