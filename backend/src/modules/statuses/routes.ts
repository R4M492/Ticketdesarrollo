import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ROLES } from "../../config/constants.js";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";
import { logAudit } from "../../lib/audit.js";

const statusSchema = z.object({
  code: z.string().min(2).max(30),
  name: z.string().min(2).max(50),
  description: z.string().max(300).nullable().optional(),
  color: z.string().max(20).optional(),
  sortOrder: z.number().int().optional().default(0),
  isClosed: z.boolean().optional().default(false),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional().default("ACTIVE"),
});

export const statusesRouter = Router();

// GET /api/statuses — catálogo para todos los roles
statusesRouter.get("/", authenticate, async (req, res, next) => {
  try {
    const statuses = await prisma.ticketStatus.findMany({
      where: req.user!.role.code === ROLES.MASTER ? undefined : { status: "ACTIVE" },
      orderBy: { sortOrder: "asc" },
    });
    res.json(statuses);
  } catch (err) {
    next(err);
  }
});

// POST /api/statuses
statusesRouter.post("/", authenticate, requireRole(ROLES.MASTER), validate({ body: statusSchema }), async (req, res, next) => {
  try {
    const status = await prisma.ticketStatus.create({ data: req.body });
    logAudit({
      userId: req.user!.id,
      action: "STATUS_CREATED",
      entityType: "STATUS",
      entityId: status.id,
      description: `Creó el estado ${status.name}`,
      req,
    });
    res.status(201).json(status);
  } catch (err) {
    next(err);
  }
});

// PUT /api/statuses/:id
statusesRouter.put("/:id", authenticate, requireRole(ROLES.MASTER), validate({ body: statusSchema.partial() }), async (req, res, next) => {
  try {
    const status = await prisma.ticketStatus.update({
      where: { id: Number(req.params.id) },
      data: req.body,
    });
    logAudit({
      userId: req.user!.id,
      action: "STATUS_UPDATED",
      entityType: "STATUS",
      entityId: status.id,
      description: `Modificó el estado ${status.name}`,
      req,
    });
    res.json(status);
  } catch (err) {
    next(err);
  }
});
