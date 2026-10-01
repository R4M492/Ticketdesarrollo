import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import { ObjectId, type Document } from "mongodb";
import { authenticate, HttpError } from "@helpdesk/common";
import { getDb } from "../../db/mongo.js";
import { env } from "../../config/env.js";
import { upload, uploadErrorMessage, UPLOAD_DIR } from "../../middleware/upload.js";
import { getTicketOrThrow } from "../../lib/ticketing-client.js";
import { logAudit } from "../../lib/audit.js";

// Fase 7. Adaptado desde los endpoints de adjuntos de backend/src/modules/tickets/routes.ts.
// Cambios respecto al original:
// - Vive en su propio servicio (attachment-service), no dentro de tickets — TicketAttachment
//   nunca existió en el schema de ticketing-service (excluido a propósito desde la Fase 0).
// - No hay `getTicketOrThrow` local: se delega en ticketing-service (ver lib/ticketing-client.ts)
//   para no duplicar la lógica de "¿puede este usuario ver este ticket?".
// - El monolito aceptaba adjuntos en la misma petición de creación de ticket o de comentario
//   (multipart). Aquí es un paso separado: primero se crea el ticket/comentario (JSON, vía
//   ticketing-service), después se adjuntan archivos con estos endpoints, pasando `ticketId` y,
//   opcionalmente, `commentId`. TODO: si se retoma la integración con el frontend, decidir si
//   conviene que el frontend haga las dos llamadas o si ticketing-service reenvía el multipart.

const requireAuth = authenticate(env.JWT_SECRET);

export const attachmentsRouter = Router();

attachmentsRouter.use(requireAuth);

interface AttachmentDoc extends Document {
  ticketId: number;
  commentId: number | null;
  userId: number;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}

function toResponse(doc: AttachmentDoc & { _id: ObjectId }) {
  return {
    id: doc._id.toString(),
    ticketId: doc.ticketId,
    commentId: doc.commentId,
    userId: doc.userId,
    originalName: doc.originalName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    createdAt: doc.createdAt,
  };
}

// GET /api/tickets/:id/attachments — lista de adjuntos de un ticket
attachmentsRouter.get("/:id/attachments", async (req, res, next) => {
  try {
    const ticketId = Number(req.params.id);
    await getTicketOrThrow(ticketId, req.headers.authorization!);
    const db = await getDb();
    const rows = await db
      .collection<AttachmentDoc>("attachments")
      .find({ ticketId })
      .sort({ createdAt: 1 })
      .toArray();
    res.json(rows.map(toResponse));
  } catch (err) {
    next(err);
  }
});

// POST /api/tickets/:id/attachments — subir uno o varios archivos (campo "files", máx. 5)
attachmentsRouter.post("/:id/attachments", (req, res, next) => {
  upload.array("files", 5)(req, res, async (err) => {
    if (err) return next(new HttpError(400, uploadErrorMessage(err)));
    try {
      const ticketId = Number(req.params.id);
      const ticket = await getTicketOrThrow(ticketId, req.headers.authorization!);
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) throw new HttpError(400, "No se recibieron archivos");

      const commentId = req.body.commentId ? Number(req.body.commentId) : null;
      const user = req.user!;
      const db = await getDb();
      const now = new Date();
      const docs: AttachmentDoc[] = files.map((f) => ({
        ticketId,
        commentId,
        userId: user.sub,
        originalName: f.originalname,
        storedName: f.filename,
        mimeType: f.mimetype,
        sizeBytes: f.size,
        createdAt: now,
      }));
      const result = await db.collection<AttachmentDoc>("attachments").insertMany(docs);

      logAudit({
        userId: user.sub,
        action: "ATTACHMENT_ADDED",
        entityType: "TICKET",
        entityId: ticketId,
        description: `${user.name} adjuntó ${files.length} archivo(s) a ${ticket.ticketNumber}`,
        req,
      });

      const created = docs.map((d, i) => ({ ...d, _id: result.insertedIds[i] }));
      res.status(201).json(created.map(toResponse));
    } catch (innerErr) {
      next(innerErr);
    }
  });
});

// GET /api/tickets/:id/attachments/:fileId — descarga autorizada
attachmentsRouter.get("/:id/attachments/:fileId", async (req, res, next) => {
  try {
    const ticketId = Number(req.params.id);
    await getTicketOrThrow(ticketId, req.headers.authorization!);

    let objectId: ObjectId;
    try {
      objectId = new ObjectId(req.params.fileId);
    } catch {
      throw new HttpError(404, "Archivo no encontrado");
    }
    const db = await getDb();
    const file = await db.collection<AttachmentDoc>("attachments").findOne({ _id: objectId });
    if (!file || file.ticketId !== ticketId) throw new HttpError(404, "Archivo no encontrado");

    const fullPath = path.join(UPLOAD_DIR, file.storedName);
    if (!fs.existsSync(fullPath)) throw new HttpError(404, "El archivo ya no existe en el servidor");
    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${file.originalName.replace(/"/g, "")}"`);
    res.sendFile(fullPath);
  } catch (err) {
    next(err);
  }
});
