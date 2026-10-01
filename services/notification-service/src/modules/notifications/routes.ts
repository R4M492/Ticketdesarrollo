import { Router } from "express";
import { z } from "zod";
import { ObjectId, type Document, type Filter } from "mongodb";
import { authenticate, validate, HttpError } from "@helpdesk/common";
import { getDb } from "../../db/mongo.js";
import { env } from "../../config/env.js";

// Adaptado desde backend/src/modules/notifications/routes.ts. Cambios respecto al original:
// - `Notification` ya no es una tabla relacional; es un documento en MongoDB (colección
//   `notifications`). El `id` que se expone es el `_id` de Mongo en string.
// - Ya no se hace `include: { ticket: ... }` (Ticket vive en ticketing-service, otra base). Si el
//   evento que originó la notificación incluyó un snapshot (`ticketNumber`/`ticketSubject`), se
//   arma el objeto `ticket` con eso; si no, queda en null. Ver notification-consumer.ts.

const requireAuth = authenticate(env.JWT_SECRET);

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z.coerce.boolean().optional(),
});

interface NotificationDoc extends Document {
  userId: number;
  ticketId: number | null;
  ticketNumber: string | null;
  ticketSubject: string | null;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}

function toResponse(doc: NotificationDoc & { _id: ObjectId }) {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    ticketId: doc.ticketId,
    ticket: doc.ticketId
      ? { id: doc.ticketId, ticketNumber: doc.ticketNumber, subject: doc.ticketSubject }
      : null,
    type: doc.type,
    title: doc.title,
    message: doc.message,
    isRead: doc.isRead,
    createdAt: doc.createdAt,
  };
}

// GET /api/notifications
notificationsRouter.get("/", validate({ query: listQuerySchema }), async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;
    const db = await getDb();
    const collection = db.collection<NotificationDoc>("notifications");

    const filter: Filter<NotificationDoc> = { userId: req.user!.sub };
    if (q.unreadOnly) filter.isRead = false;

    const [total, rows] = await Promise.all([
      collection.countDocuments(filter),
      collection
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.pageSize)
        .limit(q.pageSize)
        .toArray(),
    ]);

    res.json({ data: rows.map(toResponse), total, page: q.page, pageSize: q.pageSize });
  } catch (err) {
    next(err);
  }
});

// GET /api/notifications/unread-count
notificationsRouter.get("/unread-count", async (req, res, next) => {
  try {
    const db = await getDb();
    const count = await db
      .collection<NotificationDoc>("notifications")
      .countDocuments({ userId: req.user!.sub, isRead: false });
    res.json({ count });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/:id/read
notificationsRouter.post("/:id/read", async (req, res, next) => {
  try {
    let objectId: ObjectId;
    try {
      objectId = new ObjectId(req.params.id);
    } catch {
      throw new HttpError(404, "Notificación no encontrada");
    }
    const db = await getDb();
    const collection = db.collection<NotificationDoc>("notifications");
    const notification = await collection.findOne({ _id: objectId });
    if (!notification) throw new HttpError(404, "Notificación no encontrada");
    if (notification.userId !== req.user!.sub) {
      throw new HttpError(403, "No puedes marcar notificaciones de otros usuarios");
    }
    await collection.updateOne({ _id: objectId }, { $set: { isRead: true, readAt: new Date() } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/read-all
notificationsRouter.post("/read-all", async (req, res, next) => {
  try {
    const db = await getDb();
    await db
      .collection<NotificationDoc>("notifications")
      .updateMany({ userId: req.user!.sub, isRead: false }, { $set: { isRead: true, readAt: new Date() } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
