import { publishEvent } from "@helpdesk/common";
import { env } from "../config/env.js";

interface NotificationInput {
  userId: number;
  type: string;
  title: string;
  message: string;
  ticketId?: number | null;
}

/**
 * Fase 4: ya no escribe directo a Notification (esa tabla ahora vive en notification-service /
 * MongoDB). Publica un evento "notification.create" que notification-service consume y persiste
 * — ver packages/common/src/events.ts y
 * services/notification-service/src/consumers/notification-consumer.ts.
 *
 * `notifyRole` (notificar a todos los usuarios de un rol) NO se porta todavía: solo lo usa
 * tickets/helpers.ts, que es trabajo de la Fase 8 (ticketing-service). Cuando se porte, tendrá
 * que resolver "todos los MASTER activos" -algo que solo identity-service puede responder- antes
 * de publicar un evento por usuario, o publicar un evento dirigido al rol que notification-service
 * resuelva de otra forma. Se decide en esa fase.
 */
export async function createNotification(input: NotificationInput): Promise<void> {
  await publishEvent(env.RABBITMQ_URL, "notification.create", {
    userId: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    ticketId: input.ticketId ?? null,
  });
}
