import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { ROLES } from "../../config/constants.js";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";

export const auditRouter = Router();

auditRouter.use(authenticate, requireRole(ROLES.MASTER));

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  userId: z.coerce.number().int().optional(),
  action: z.string().max(50).optional(),
  entityType: z.string().max(50).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

// GET /api/audit-logs
auditRouter.get("/", validate({ query: listQuerySchema }), async (req, res, next) => {
  try {
    const q = req.query;
    const page = Number(q.page);
    const pageSize = Number(q.pageSize);
    const where: Prisma.AuditLogWhereInput = {};
    if (q.search) {
      where.description = { contains: String(q.search) };
    }
    if (q.userId) where.userId = Number(q.userId);
    if (q.action) where.action = String(q.action);
    if (q.entityType) where.entityType = String(q.entityType);
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(String(q.from));
      if (q.to) where.createdAt.lte = new Date(String(q.to));
    }

    const [total, data] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    res.json({ data, total, page, pageSize });
  } catch (err) {
    next(err);
  }
});

// GET /api/audit-logs/actions — lista de acciones disponibles para filtrar
auditRouter.get("/actions", async (_req, res, next) => {
  try {
    const actions = await prisma.auditLog.findMany({
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    });
    res.json(actions.map((a) => a.action));
  } catch (err) {
    next(err);
  }
});
