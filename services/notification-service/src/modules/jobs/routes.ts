import { Router } from "express";
import { z } from "zod";
import type { Filter } from "mongodb";
import { authenticate, validate, HttpError } from "@helpdesk/common";
import { getDb } from "../../db/mongo.js";
import { env } from "../../config/env.js";

// Trabajos asíncronos consultables por el frontend (ver email-consumer.ts, el único consumidor
// que hoy escribe en esta colección). No está ligado a un ticket por autorización fina a
// propósito — cualquier usuario autenticado puede consultar el estado de un trabajo si conoce su
// id o el ticketId asociado; no hay datos sensibles en un registro de "se envió este correo".

const requireAuth = authenticate(env.JWT_SECRET);

export const jobsRouter = Router();
jobsRouter.use(requireAuth);

export type JobStatus = "PROCESSING" | "RETRYING" | "COMPLETED" | "FAILED";

export interface JobDoc {
  _id: string;
  type: string;
  status: JobStatus;
  attempt: number;
  maxAttempts: number;
  ticketId: number | null;
  to: string;
  subject: string;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

function toResponse(doc: JobDoc) {
  return {
    id: doc._id,
    type: doc.type,
    status: doc.status,
    attempt: doc.attempt,
    maxAttempts: doc.maxAttempts,
    ticketId: doc.ticketId,
    subject: doc.subject,
    lastError: doc.lastError,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    completedAt: doc.completedAt,
  };
}

const listQuerySchema = z.object({
  ticketId: z.coerce.number().int().positive().optional(),
  type: z.string().optional(),
});

// GET /api/jobs?ticketId=&type=
jobsRouter.get("/", validate({ query: listQuerySchema }), async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;
    const db = await getDb();
    const filter: Filter<JobDoc> = {};
    if (q.ticketId) filter.ticketId = q.ticketId;
    if (q.type) filter.type = q.type;
    const rows = await db.collection<JobDoc>("jobs").find(filter).sort({ createdAt: -1 }).limit(50).toArray();
    res.json(rows.map(toResponse));
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:id
jobsRouter.get("/:id", async (req, res, next) => {
  try {
    const db = await getDb();
    const job = await db.collection<JobDoc>("jobs").findOne({ _id: req.params.id });
    if (!job) throw new HttpError(404, "Trabajo no encontrado");
    res.json(toResponse(job));
  } catch (err) {
    next(err);
  }
});
