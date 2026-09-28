import { Router, type Request, type Response } from "express";
import path from "node:path";
import fs from "node:fs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { ROLES, NOTIFICATION_TYPES } from "../../config/constants.js";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";
import { HttpError } from "../../middleware/error.js";
import { logAudit } from "../../lib/audit.js";
import { generateTicketNumber } from "../../lib/ticket-number.js";
import { computeSlaDates, ticketSlaIndicator } from "../../lib/sla.js";
import { upload, uploadErrorMessage, UPLOAD_DIR } from "../../middleware/upload.js";
import {
  ticketInclude,
  getTicketOrThrow,
  ALLOWED_TRANSITIONS,
  TECHNICIAN_MANUAL_TRANSITIONS,
  getStatusByCode,
  notifyRequester,
  notifyTechnician,
  notifyRole,
} from "./helpers.js";

export const ticketsRouter = Router();

ticketsRouter.use(authenticate);

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
    const q = req.query;
    const user = req.user!;
    const page = Number(q.page);
    const pageSize = Number(q.pageSize);

    const where: Prisma.TicketWhereInput = {};
    if (user.role.code === ROLES.TECNICO) {
      where.assignedTechnicianId = user.id;
    } else if (user.role.code === ROLES.USUARIO) {
      where.userId = user.id;
    }

    if (q.search) {
      const s = String(q.search);
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
    if (q.statusId) where.statusId = Number(q.statusId);
    if (q.statusCode) where.status = { code: String(q.statusCode) };
    if (q.priorityId) where.priorityId = Number(q.priorityId);
    if (q.categoryId) where.categoryId = Number(q.categoryId);
    if (q.technicianId && user.role.code === ROLES.MASTER) where.assignedTechnicianId = Number(q.technicianId);
    if (q.companyId && user.role.code === ROLES.MASTER) where.companyId = Number(q.companyId);
    if (q.userId && user.role.code === ROLES.MASTER) where.userId = Number(q.userId);
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(String(q.from));
      if (q.to) where.createdAt.lte = new Date(String(q.to));
    }

    const orderBy = { [String(q.sortBy)]: String(q.sortDir) } as Prisma.TicketOrderByWithRelationInput;

    const [total, rows] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({
        where,
        include: ticketInclude,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    let data = rows.map((t) => ({ ...t, sla: ticketSlaIndicator(t) }));
    if (q.sla) {
      data = data.filter((t) => t.sla === q.sla);
    }

    res.json({ data, total, page, pageSize });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /api/tickets/export — exportación CSV (MASTER)
// ============================================================
ticketsRouter.get("/export", requireRole(ROLES.MASTER), validate({ query: listQuerySchema }), async (req, res, next) => {
  try {
    const q = req.query;
    const where: Prisma.TicketWhereInput = {};
    if (q.search) {
      const s = String(q.search);
      where.OR = [
        { ticketNumber: { contains: s } },
        { subject: { contains: s } },
        { requesterName: { contains: s } },
        { requesterEmail: { contains: s } },
      ];
    }
    if (q.statusId) where.statusId = Number(q.statusId);
    if (q.statusCode) where.status = { code: String(q.statusCode) };
    if (q.priorityId) where.priorityId = Number(q.priorityId);
    if (q.categoryId) where.categoryId = Number(q.categoryId);
    if (q.technicianId) where.assignedTechnicianId = Number(q.technicianId);
    if (q.companyId) where.companyId = Number(q.companyId);
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(String(q.from));
      if (q.to) where.createdAt.lte = new Date(String(q.to));
    }

    const rows = await prisma.ticket.findMany({
      where,
      include: ticketInclude,
      orderBy: { createdAt: "desc" },
    });

    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const header = [
      "Ticket", "Asunto", "Solicitante", "Correo", "Empresa", "Departamento",
      "Categoría", "Subcategoría", "Prioridad", "Técnico", "Estado", "Ubicación",
      "Equipo", "Inventario", "Creado", "Primera respuesta", "Resuelto", "Cerrado", "SLA",
    ].join(",");
    const lines = rows.map((t) =>
      [
        esc(t.ticketNumber), esc(t.subject), esc(t.requesterName), esc(t.requesterEmail),
        esc(t.company?.name), esc(t.department?.name), esc(t.category.name),
        esc(t.subcategory?.name), esc(t.priority.name), esc(t.assignedTechnician?.name),
        esc(t.status.name), esc(t.location), esc(t.device), esc(t.inventoryNumber),
        esc(t.createdAt.toISOString()), esc(t.firstResponseAt?.toISOString()),
        esc(t.resolvedAt?.toISOString()), esc(t.closedAt?.toISOString()),
        esc(ticketSlaIndicator(t)),
      ].join(","),
    );
    const csv = "\uFEFF" + [header, ...lines].join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="tickets-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /api/tickets — creación (multipart con adjuntos opcionales)
// ============================================================
ticketsRouter.post("/", upload.fields([{ name: "files", maxCount: 5 }]), async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Datos inválidos",
        details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      });
    }
    const data = parsed.data;
    const user = req.user!;
    const files = (req.files as Record<string, Express.Multer.File[]> | undefined)?.files ?? [];

    const [category, priority] = await Promise.all([
      prisma.ticketCategory.findUnique({ where: { id: data.categoryId } }),
      prisma.ticketPriority.findUnique({ where: { id: data.priorityId }, include: { sla: true } }),
    ]);
    if (!category || category.status !== "ACTIVE") throw new HttpError(400, "Categoría inválida");
    if (!priority || priority.status !== "ACTIVE") throw new HttpError(400, "Prioridad inválida");
    if (data.subcategoryId) {
      const sub = await prisma.ticketSubcategory.findUnique({ where: { id: data.subcategoryId } });
      if (!sub || sub.categoryId !== category.id) throw new HttpError(400, "Subcategoría inválida");
    }

    const statusNuevo = await getStatusByCode("NUEVO");
    if (!statusNuevo) throw new HttpError(500, "Falta el estado NUEVO en el catálogo");

    const now = new Date();
    const ticketNumber = await generateTicketNumber(prisma);
    const slaDates = priority.sla?.active
      ? computeSlaDates(now, priority.sla)
      : { slaResponseDueAt: null, slaResolutionDueAt: null };

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        userId: user.id,
        subject: data.subject,
        categoryId: category.id,
        subcategoryId: data.subcategoryId ?? null,
        priorityId: priority.id,
        statusId: statusNuevo.id,
        description: data.description,
        location: data.location ?? null,
        device: data.device ?? null,
        inventoryNumber: data.inventoryNumber ?? null,
        requesterName: user.name,
        requesterEmail: user.email,
        requesterPhone: user.phone ?? null,
        companyId: user.companyId ?? null,
        departmentId: user.departmentId ?? null,
        slaResponseDueAt: slaDates.slaResponseDueAt,
        slaResolutionDueAt: slaDates.slaResolutionDueAt,
        createdAt: now,
        attachments: {
          create: files.map((f) => ({
            originalName: f.originalname,
            storedName: f.filename,
            mimeType: f.mimetype,
            sizeBytes: f.size,
            userId: user.id,
          })),
        },
      },
      include: ticketInclude,
    });

    await prisma.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        userId: user.id,
        action: "CREATED",
        description: "Ticket creado",
        newValue: ticket.ticketNumber,
      },
    });
    if (files.length > 0) {
      await prisma.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          userId: user.id,
          action: "ATTACHMENT_ADDED",
          description: `Se adjuntaron ${files.length} archivo(s)`,
        },
      });
    }
    logAudit({
      userId: user.id,
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
    });
    notifyRequester(ticket, NOTIFICATION_TYPES.TICKET_CREATED, "Ticket creado", `Tu ticket ${ticket.ticketNumber} fue registrado correctamente.`);

    res.status(201).json({ ...ticket, sla: ticketSlaIndicator(ticket) });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /api/tickets/:id — detalle
// ============================================================
ticketsRouter.get("/:id", async (req, res, next) => {
  try {
    const ticket = await getTicketOrThrow(Number(req.params.id), req.user!);
    const attachments = await prisma.ticketAttachment.findMany({
      where: { ticketId: ticket.id },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
    res.json({ ...ticket, sla: ticketSlaIndicator(ticket), attachments });
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
    if (user.role.code !== ROLES.MASTER && ticket.userId !== user.id) {
      throw new HttpError(403, "Solo el solicitante o el MASTER pueden editar el ticket");
    }
    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: req.body,
      include: ticketInclude,
    });
    await prisma.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        userId: user.id,
        action: "TICKET_EDITED",
        description: "Se editó el asunto o la descripción del ticket",
      },
    });
    logAudit({
      userId: user.id,
      action: "TICKET_EDITED",
      entityType: "TICKET",
      entityId: ticket.id,
      description: `Editó el ticket ${ticket.ticketNumber}`,
      req,
    });
    res.json({ ...updated, sla: ticketSlaIndicator(updated) });
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
    const [histories, comments, assignments, solutions] = await Promise.all([
      prisma.ticketHistory.findMany({
        where: { ticketId: ticket.id },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.ticketComment.findMany({
        where: { ticketId: ticket.id },
        include: { user: { select: { id: true, name: true } }, attachments: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.ticketAssignment.findMany({
        where: { ticketId: ticket.id },
        include: {
          assignedBy: { select: { id: true, name: true } },
          previousTechnician: { select: { id: true, name: true } },
          newTechnician: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.ticketSolution.findMany({
        where: { ticketId: ticket.id },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);

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
        user: h.user,
        createdAt: h.createdAt,
        meta: { action: h.action, oldValue: h.oldValue, newValue: h.newValue },
      })),
      ...comments.map((c) => ({
        id: `c-${c.id}`,
        kind: "comment",
        title: "Seguimiento",
        description: c.comment,
        user: c.user,
        createdAt: c.createdAt,
        meta: { attachments: c.attachments },
      })),
      ...assignments.map((a) => {
        const isReassign = Boolean(a.previousTechnicianId);
        const prevName = a.previousTechnician?.name ?? "—";
        const newName = a.newTechnician?.name ?? "—";
        return {
          id: `a-${a.id}`,
          kind: "assignment",
          title: isReassign ? "Reasignación" : "Asignación",
          description: `${a.assignedBy?.name} ${isReassign ? `reasignó de ${prevName} a ${newName}` : `asignó a ${newName}`}${a.reason ? ` — Motivo: ${a.reason}` : ""}`,
          user: a.assignedBy,
          createdAt: a.createdAt,
          meta: { isReassign, reason: a.reason },
        };
      }),
      ...solutions.map((s) => ({
        id: `s-${s.id}`,
        kind: "solution",
        title: "Solución registrada",
        description: `${s.problemIdentified}${s.cause ? `\nCausa: ${s.cause}` : ""}\nSolución: ${s.solutionApplied}${s.observations ? `\nObservaciones: ${s.observations}` : ""}${s.timeUsedMinutes ? `\nTiempo utilizado: ${s.timeUsedMinutes} min` : ""}`,
        user: s.user,
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
// POST /api/tickets/:id/comments — seguimiento (multipart con adjuntos)
// ============================================================
ticketsRouter.post("/:id/comments", upload.fields([{ name: "files", maxCount: 5 }]), async (req, res, next) => {
  try {
    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "El comentario no puede estar vacío" });
    }
    const ticket = await getTicketOrThrow(Number(req.params.id), req.user!);
    const user = req.user!;
    const files = (req.files as Record<string, Express.Multer.File[]> | undefined)?.files ?? [];

    const comment = await prisma.ticketComment.create({
      data: {
        ticketId: ticket.id,
        userId: user.id,
        comment: parsed.data.comment,
        attachments: {
          create: files.map((f) => ({
            ticketId: ticket.id,
            originalName: f.originalname,
            storedName: f.filename,
            mimeType: f.mimetype,
            sizeBytes: f.size,
            userId: user.id,
          })),
        },
      },
      include: { user: { select: { id: true, name: true } }, attachments: true },
    });

    // Primera respuesta: primer comentario del soporte (técnico o MASTER)
    if (!ticket.firstResponseAt && user.role.code !== ROLES.USUARIO) {
      await prisma.ticket.update({ where: { id: ticket.id }, data: { firstResponseAt: new Date() } });
    }

    await prisma.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        userId: user.id,
        action: "COMMENT_ADDED",
        description: `${user.name} agregó un seguimiento${files.length ? ` con ${files.length} adjunto(s)` : ""}`,
      },
    });
    logAudit({
      userId: user.id,
      action: "COMMENT_ADDED",
      entityType: "TICKET",
      entityId: ticket.id,
      description: `Comentario en ${ticket.ticketNumber}`,
      req,
    });

    if (user.role.code === ROLES.USUARIO) {
      notifyTechnician(ticket.assignedTechnicianId, ticket, NOTIFICATION_TYPES.COMMENT_ADDED, "Comentario del usuario", `${ticket.ticketNumber}: ${user.name} agregó un comentario.`);
      notifyRole(ROLES.MASTER, { type: NOTIFICATION_TYPES.COMMENT_ADDED, title: "Comentario en ticket", message: `${ticket.ticketNumber}: ${user.name} agregó un comentario.`, ticketId: ticket.id });
    } else {
      notifyRequester(ticket, NOTIFICATION_TYPES.COMMENT_ADDED, "Nuevo seguimiento", `${ticket.ticketNumber}: ${user.name} agregó un comentario a tu ticket.`);
    }

    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /api/tickets/:id/attachments — subir adjuntos sueltos
// ============================================================
ticketsRouter.post("/:id/attachments", upload.array("files", 5), async (req, res, next) => {
  try {
    const ticket = await getTicketOrThrow(Number(req.params.id), req.user!);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw new HttpError(400, "No se recibieron archivos");
    const created = await prisma.$transaction(
      files.map((f) =>
        prisma.ticketAttachment.create({
          data: {
            ticketId: ticket.id,
            originalName: f.originalname,
            storedName: f.filename,
            mimeType: f.mimetype,
            sizeBytes: f.size,
            userId: req.user!.id,
          },
        }),
      ),
    );
    await prisma.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        userId: req.user!.id,
        action: "ATTACHMENT_ADDED",
        description: `Se adjuntaron ${files.length} archivo(s)`,
      },
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /api/tickets/:id/attachments/:fileId — descarga autorizada
// ============================================================
ticketsRouter.get("/:id/attachments/:fileId", async (req, res, next) => {
  try {
    const ticket = await getTicketOrThrow(Number(req.params.id), req.user!);
    const file = await prisma.ticketAttachment.findUnique({ where: { id: Number(req.params.fileId) } });
    if (!file || file.ticketId !== ticket.id) throw new HttpError(404, "Archivo no encontrado");
    const fullPath = path.join(UPLOAD_DIR, file.storedName);
    if (!fs.existsSync(fullPath)) throw new HttpError(404, "El archivo ya no existe en el servidor");
    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${file.originalName.replace(/"/g, "")}"`);
    res.sendFile(fullPath);
  } catch (err) {
    next(err);
  }
});

async function assignTicket(req: Request, res: Response, requireExistingTechnician: boolean) {
  const ticket = await getTicketOrThrow(Number(req.params.id), req.user!);
  const { technicianId, reason } = req.body;

  if (requireExistingTechnician && !ticket.assignedTechnicianId) {
    throw new HttpError(400, "El ticket no tiene un técnico asignado; usa asignar");
  }

  const role = await prisma.role.findUnique({ where: { code: ROLES.TECNICO } });
  const technician = await prisma.user.findUnique({
    where: { id: technicianId },
    include: { role: true },
  });
  if (!technician || !role || technician.roleId !== role.id || technician.status !== "ACTIVE") {
    throw new HttpError(400, "El técnico seleccionado no es válido");
  }

  const previousId = ticket.assignedTechnicianId ?? null;
  const isReassign = requireExistingTechnician || (previousId !== null && previousId !== technicianId);
  const statusAsignado = await getStatusByCode("ASIGNADO");
  if (!statusAsignado) throw new HttpError(500, "Falta el estado ASIGNADO en el catálogo");

  const updated = await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      assignedTechnicianId: technician.id,
      statusId: statusAsignado.id,
      firstResponseAt: ticket.firstResponseAt ?? new Date(),
    },
    include: ticketInclude,
  });

  await prisma.ticketAssignment.create({
    data: {
      ticketId: ticket.id,
      assignedById: req.user!.id,
      previousTechnicianId: previousId,
      newTechnicianId: technician.id,
      reason: reason ?? null,
    },
  });
  await prisma.ticketHistory.create({
    data: {
      ticketId: ticket.id,
      userId: req.user!.id,
      action: isReassign ? "REASSIGNED" : "ASSIGNED",
      description: isReassign
        ? `Reasignado a ${technician.name}${reason ? ` — Motivo: ${reason}` : ""}`
        : `Asignado a ${technician.name}`,
      oldValue: ticket.assignedTechnician?.name ?? null,
      newValue: technician.name,
    },
  });
  logAudit({
    userId: req.user!.id,
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

  res.json({ ...updated, sla: ticketSlaIndicator(updated) });
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
    const target = await prisma.ticketStatus.findUnique({ where: { code: String(req.body.status) } });
    if (!target) throw new HttpError(400, "Estado inválido");

    const currentCode = ticket.status.code;
    const allowed = ALLOWED_TRANSITIONS[currentCode] ?? [];

    // Permisos según rol
    if (user.role.code === ROLES.USUARIO) {
      throw new HttpError(403, "El solicitante no puede cambiar estados directamente");
    }
    if (user.role.code === ROLES.TECNICO) {
      const techAllowed = TECHNICIAN_MANUAL_TRANSITIONS[currentCode] ?? [];
      if (!techAllowed.includes(target.code)) {
        throw new HttpError(403, "No puedes pasar de " + currentCode + " a " + target.code);
      }
    }
    if (!allowed.includes(target.code)) {
      throw new HttpError(400, `Transición no permitida: ${currentCode} → ${target.code}`);
    }

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { statusId: target.id },
      include: ticketInclude,
    });
    await prisma.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        userId: user.id,
        action: "STATUS_CHANGED",
        description: `${ticket.status.name} → ${target.name}${req.body.comment ? ` — ${req.body.comment}` : ""}`,
        oldValue: ticket.status.name,
        newValue: target.name,
      },
    });
    logAudit({
      userId: user.id,
      action: "STATUS_CHANGED",
      entityType: "TICKET",
      entityId: ticket.id,
      description: `Cambió estado de ${ticket.ticketNumber}: ${ticket.status.name} → ${target.name}`,
      req,
    });
    if (user.role.code !== ROLES.USUARIO) {
      notifyRequester(ticket, NOTIFICATION_TYPES.STATUS_CHANGED, "Cambio de estado", `Tu ticket ${ticket.ticketNumber} cambió a: ${target.name}.`);
    }
    if (user.role.code === ROLES.USUARIO) {
      notifyTechnician(ticket.assignedTechnicianId, ticket, NOTIFICATION_TYPES.STATUS_CHANGED, "Cambio de estado", `${ticket.ticketNumber} cambió a: ${target.name}.`);
    }
    res.json({ ...updated, sla: ticketSlaIndicator(updated) });
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
    if (user.role.code === ROLES.USUARIO) {
      throw new HttpError(403, "El solicitante no puede resolver tickets");
    }
    if (user.role.code === ROLES.TECNICO && ticket.assignedTechnicianId !== user.id) {
      throw new HttpError(403, "Solo el técnico asignado puede resolver este ticket");
    }
    if (!["ASIGNADO", "EN_PROCESO", "ESPERA_USUARIO", "REABIERTO"].includes(ticket.status.code)) {
      throw new HttpError(400, `No se puede resolver un ticket en estado ${ticket.status.name}`);
    }

    const statusResuelto = await getStatusByCode("RESUELTO");
    if (!statusResuelto) throw new HttpError(500, "Falta el estado RESUELTO en el catálogo");

    const [solution, updated] = await prisma.$transaction([
      prisma.ticketSolution.create({
        data: {
          ticketId: ticket.id,
          userId: user.id,
          problemIdentified: req.body.problemIdentified,
          cause: req.body.cause ?? null,
          solutionApplied: req.body.solutionApplied,
          observations: req.body.observations ?? null,
          timeUsedMinutes: req.body.timeUsedMinutes ?? null,
        },
      }),
      prisma.ticket.update({
        where: { id: ticket.id },
        data: { statusId: statusResuelto.id, resolvedAt: new Date() },
        include: ticketInclude,
      }),
    ]);

    await prisma.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        userId: user.id,
        action: "RESOLVED",
        description: `Resuelto por ${user.name}: ${req.body.solutionApplied}`,
        oldValue: ticket.status.name,
        newValue: "Resuelto",
      },
    });
    logAudit({
      userId: user.id,
      action: "TICKET_RESOLVED",
      entityType: "TICKET",
      entityId: ticket.id,
      description: `Resolvió ${ticket.ticketNumber}`,
      req,
    });
    notifyRequester(ticket, NOTIFICATION_TYPES.TICKET_RESOLVED, "Ticket resuelto", `Tu ticket ${ticket.ticketNumber} fue marcado como resuelto. Confirma la solución o indícanos si el problema continúa.`);

    res.json({ ...updated, sla: ticketSlaIndicator(updated), solution });
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
    if (user.role.code !== ROLES.MASTER && ticket.userId !== user.id) {
      throw new HttpError(403, "Solo el solicitante o el MASTER pueden confirmar la solución");
    }
    if (ticket.status.code !== "RESUELTO") {
      throw new HttpError(400, "El ticket debe estar en estado Resuelto para confirmar");
    }
    const statusCerrado = await getStatusByCode("CERRADO");
    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { statusId: statusCerrado!.id, closedAt: new Date() },
      include: ticketInclude,
    });
    await prisma.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        userId: user.id,
        action: "CLOSED",
        description: `Cerrado por ${user.name} (confirmación del solicitante)`,
        oldValue: "Resuelto",
        newValue: "Cerrado",
      },
    });
    logAudit({
      userId: user.id,
      action: "TICKET_CLOSED",
      entityType: "TICKET",
      entityId: ticket.id,
      description: `Cerró ${ticket.ticketNumber}`,
      req,
    });
    notifyTechnician(ticket.assignedTechnicianId, ticket, NOTIFICATION_TYPES.TICKET_CLOSED, "Ticket cerrado", `${ticket.ticketNumber} fue cerrado por el usuario.`);
    res.json({ ...updated, sla: ticketSlaIndicator(updated) });
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
    if (user.role.code !== ROLES.MASTER && ticket.userId !== user.id) {
      throw new HttpError(403, "Solo el solicitante o el MASTER pueden reabrir el ticket");
    }
    if (!["RESUELTO", "CERRADO"].includes(ticket.status.code)) {
      throw new HttpError(400, "Solo se pueden reabrir tickets Resueltos o Cerrados");
    }
    const statusReabierto = await getStatusByCode("REABIERTO");
    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        statusId: statusReabierto!.id,
        reopenedCount: { increment: 1 },
        resolvedAt: null,
        closedAt: null,
      },
      include: ticketInclude,
    });
    await prisma.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        userId: user.id,
        action: "REOPENED",
        description: `Reabierto por ${user.name} — Motivo: ${req.body.reason}`,
        oldValue: ticket.status.name,
        newValue: "Reabierto",
      },
    });
    logAudit({
      userId: user.id,
      action: "TICKET_REOPENED",
      entityType: "TICKET",
      entityId: ticket.id,
      description: `Reabrió ${ticket.ticketNumber}: ${req.body.reason}`,
      req,
    });
    notifyRole(ROLES.MASTER, {
      type: NOTIFICATION_TYPES.TICKET_REOPENED,
      title: "Ticket reabierto",
      message: `${ticket.ticketNumber} fue reabierto por ${user.name}. Motivo: ${req.body.reason}`,
      ticketId: ticket.id,
    });
    notifyTechnician(ticket.assignedTechnicianId, ticket, NOTIFICATION_TYPES.TICKET_REOPENED, "Ticket reabierto", `${ticket.ticketNumber} fue reabierto por el usuario.`);
    res.json({ ...updated, sla: ticketSlaIndicator(updated) });
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
    if (user.role.code !== ROLES.MASTER && ticket.userId !== user.id) {
      throw new HttpError(403, "Solo el solicitante o el MASTER pueden cancelar el ticket");
    }
    const statusCancelado = await getStatusByCode("CANCELADO");
    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { statusId: statusCancelado!.id },
      include: ticketInclude,
    });
    await prisma.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        userId: user.id,
        action: "CANCELED",
        description: `Cancelado por ${user.name}`,
        oldValue: ticket.status.name,
        newValue: "Cancelado",
      },
    });
    logAudit({
      userId: user.id,
      action: "TICKET_CANCELED",
      entityType: "TICKET",
      entityId: ticket.id,
      description: `Canceló ${ticket.ticketNumber}`,
      req,
    });
    notifyRole(ROLES.MASTER, {
      type: NOTIFICATION_TYPES.TICKET_CANCELED,
      title: "Ticket cancelado",
      message: `${ticket.ticketNumber} fue cancelado por ${user.name}.`,
      ticketId: ticket.id,
    });
    res.json({ ...updated, sla: ticketSlaIndicator(updated) });
  } catch (err) {
    next(err);
  }
});
