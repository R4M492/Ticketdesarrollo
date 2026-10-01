import { consumeEvents, type DomainEvent } from "@helpdesk/common";
import { getDb } from "../db/mongo.js";
import { env } from "../config/env.js";

interface NotificationCreatedPayload {
  userId: number;
  type: string;
  title: string;
  message: string;
  ticketId: number | null;
  // Snapshot opcional del ticket relacionado (lo incluirá ticketing-service en la Fase 8,
  // cuando publique eventos que sí involucran un ticket real).
  ticketNumber?: string | null;
  ticketSubject?: string | null;
}

/** Se suscribe a "notification.create" (hoy publicado por identity-service) y persiste. */
export async function startNotificationConsumer(): Promise<void> {
  await consumeEvents<NotificationCreatedPayload>(
    env.RABBITMQ_URL,
    "notification-service.notification-create",
    ["notification.create"],
    async (event: DomainEvent<NotificationCreatedPayload>) => {
      const db = await getDb();
      await db.collection("notifications").insertOne({
        userId: event.payload.userId,
        type: event.payload.type,
        title: event.payload.title,
        message: event.payload.message,
        ticketId: event.payload.ticketId ?? null,
        ticketNumber: event.payload.ticketNumber ?? null,
        ticketSubject: event.payload.ticketSubject ?? null,
        isRead: false,
        readAt: null,
        createdAt: new Date(event.occurredAt),
      });
    },
  );
  console.log('[notification-service] escuchando eventos "notification.create"');
}
