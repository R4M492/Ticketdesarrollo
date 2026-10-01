import { Router } from "express";
import { z } from "zod";
import { authenticate, requireRole, validate, HttpError } from "@helpdesk/common";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { ROLES } from "../../config/constants.js";
import { logAudit } from "../../lib/audit.js";

// Adaptado desde backend/src/modules/priorities/routes.ts. Mismo cambio que categories/routes.ts
// en el DELETE (ya no valida contra Ticket, ver esa nota). El bug encontrado en Fase 0
// (borrar una prioridad con SLA configurado devolvía 500 por una violación de llave foránea no
// manejada) queda resuelto de raíz aquí: @helpdesk/common#errorHandler ya traduce Prisma P2003
// a 409 — no hace falta ningún manejo especial en esta ruta.

const requireAuth = authenticate(env.JWT_SECRET);

const prioritySchema = z.object({
  code: z.string().min(2).max(20),
  name: z.string().min(2).max(50),
  description: z.string().max(300).nullable().optional(),
  color: z.string().max(20).optional(),
  sortOrder: z.number().int().optional().default(0),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional().default("ACTIVE"),
});

const slaSchema = z.object({
  responseMinutes: z.number().int().min(1, "El tiempo de respuesta debe ser positivo"),
  resolutionHours: z.number().int().min(1, "El tiempo objetivo debe ser positivo"),
  active: z.boolean().optional().default(true),
});

export const prioritiesRouter = Router();

// GET /api/priorities — con su SLA
prioritiesRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const priorities = await prisma.ticketPriority.findMany({
      where: req.user!.role === ROLES.MASTER ? undefined : { status: "ACTIVE" },
      include: { sla: true },
      orderBy: { sortOrder: "asc" },
    });
    res.json(priorities);
  } catch (err) {
    next(err);
  }
});

// POST /api/priorities
prioritiesRouter.post("/", requireAuth, requireRole(ROLES.MASTER), validate({ body: prioritySchema }), async (req, res, next) => {
  try {
    const priority = await prisma.ticketPriority.create({ data: req.body });
    logAudit({
      userId: req.user!.sub,
      action: "PRIORITY_CREATED",
      entityType: "PRIORITY",
      entityId: priority.id,
      description: `Creó la prioridad ${priority.name}`,
      req,
    });
    res.status(201).json(priority);
  } catch (err) {
    next(err);
  }
});

// PUT /api/priorities/:id
prioritiesRouter.put("/:id", requireAuth, requireRole(ROLES.MASTER), validate({ body: prioritySchema.partial() }), async (req, res, next) => {
  try {
    const priority = await prisma.ticketPriority.update({
      where: { id: Number(req.params.id) },
      data: req.body,
      include: { sla: true },
    });
    logAudit({
      userId: req.user!.sub,
      action: "PRIORITY_UPDATED",
      entityType: "PRIORITY",
      entityId: priority.id,
      description: `Modificó la prioridad ${priority.name}`,
      req,
    });
    res.json(priority);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/priorities/:id
prioritiesRouter.delete("/:id", requireAuth, requireRole(ROLES.MASTER), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.ticketPriority.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/priorities/:id/sla
prioritiesRouter.get("/:id/sla", requireAuth, async (req, res, next) => {
  try {
    const sla = await prisma.slaConfiguration.findUnique({
      where: { priorityId: Number(req.params.id) },
    });
    res.json(sla);
  } catch (err) {
    next(err);
  }
});

// PUT /api/priorities/:id/sla
prioritiesRouter.put("/:id/sla", requireAuth, requireRole(ROLES.MASTER), validate({ body: slaSchema }), async (req, res, next) => {
  try {
    const priorityId = Number(req.params.id);
    const existing = await prisma.ticketPriority.findUnique({ where: { id: priorityId } });
    if (!existing) throw new HttpError(404, "Prioridad no encontrada");

    const sla = await prisma.slaConfiguration.upsert({
      where: { priorityId },
      create: { priorityId, ...req.body, updatedById: req.user!.sub },
      update: { ...req.body, updatedById: req.user!.sub },
    });
    logAudit({
      userId: req.user!.sub,
      action: "SLA_CONFIGURED",
      entityType: "SLA",
      entityId: priorityId,
      description: `Configuró el SLA de la prioridad ${existing.name}: respuesta ${sla.responseMinutes} min, objetivo ${sla.resolutionHours} h`,
      req,
    });
    res.json(sla);
  } catch (err) {
    next(err);
  }
});
