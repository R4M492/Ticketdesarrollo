import { Router } from "express";
import { z } from "zod";
import type { Filter, Document } from "mongodb";
import { authenticate, requireRole, validate } from "@helpdesk/common";
import { getDb } from "../../db/mongo.js";
import { env } from "../../config/env.js";
import { ROLES } from "../../config/constants.js";

// Adaptado desde backend/src/modules/audit/routes.ts. Cambios respecto al original:
// - `AuditLog` ya no es una tabla relacional con FK a `User`; es un documento en MongoDB
//   (colección `audit_logs`) que ya trae userName/userEmail como snapshot, publicados por el
//   servicio que originó el evento (ver services/identity-service/src/lib/audit.ts) — no se
//   hace ningún `include`/join porque identity-service (dueño de User) es otra base de datos.
// - El `id` que se devuelve es el `_id` de Mongo en formato string, no un entero autoincremental.

const requireAuth = authenticate(env.JWT_SECRET);

export const auditRouter = Router();

auditRouter.use(requireAuth, requireRole(ROLES.MASTER));

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

interface AuditLogDoc extends Document {
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

// GET /api/audit-logs
auditRouter.get("/", validate({ query: listQuerySchema }), async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;
    const db = await getDb();
    const collection = db.collection<AuditLogDoc>("audit_logs");

    const filter: Filter<AuditLogDoc> = {};
    if (q.search) filter.description = { $regex: q.search, $options: "i" };
    if (q.userId) filter.userId = q.userId;
    if (q.action) filter.action = q.action;
    if (q.entityType) filter.entityType = q.entityType;
    if (q.from || q.to) {
      filter.createdAt = {};
      if (q.from) filter.createdAt.$gte = new Date(q.from);
      if (q.to) filter.createdAt.$lte = new Date(q.to);
    }

    const [total, rows] = await Promise.all([
      collection.countDocuments(filter),
      collection
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.pageSize)
        .limit(q.pageSize)
        .toArray(),
    ]);

    const data = rows.map((r) => ({
      id: r._id.toString(),
      userId: r.userId,
      user: r.userId ? { id: r.userId, name: r.userName, email: r.userEmail } : null,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      description: r.description,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      createdAt: r.createdAt,
    }));

    res.json({ data, total, page: q.page, pageSize: q.pageSize });
  } catch (err) {
    next(err);
  }
});

// GET /api/audit-logs/actions — lista de acciones disponibles para filtrar
auditRouter.get("/actions", async (_req, res, next) => {
  try {
    const db = await getDb();
    const actions = await db.collection<AuditLogDoc>("audit_logs").distinct("action");
    res.json(actions.sort());
  } catch (err) {
    next(err);
  }
});
