import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { HttpError } from "../../middleware/error.js";

export const notificationsRouter = Router();

notificationsRouter.use(authenticate);

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z.coerce.boolean().optional(),
});

// GET /api/notifications
notificationsRouter.get("/", validate({ query: listQuerySchema }), async (req, res, next) => {
  try {
    const page = Number(req.query.page);
    const pageSize = Number(req.query.pageSize);
    const where = {
      userId: req.user!.id,
      ...(req.query.unreadOnly ? { isRead: false } : {}),
    };
    const [total, data] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        include: { ticket: { select: { id: true, ticketNumber: true, subject: true } } },
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

// GET /api/notifications/unread-count
notificationsRouter.get("/unread-count", async (req, res, next) => {
  try {
    const count = await prisma.notification.count({
      where: { userId: req.user!.id, isRead: false },
    });
    res.json({ count });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/:id/read
notificationsRouter.post("/:id/read", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification) throw new HttpError(404, "Notificación no encontrada");
    if (notification.userId !== req.user!.id) throw new HttpError(403, "No puedes marcar notificaciones de otros usuarios");
    await prisma.notification.update({ where: { id }, data: { isRead: true, readAt: new Date() } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/read-all
notificationsRouter.post("/read-all", async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
