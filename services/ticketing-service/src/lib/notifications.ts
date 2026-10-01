import { publishEvent } from "@helpdesk/common";
import { env } from "../config/env.js";
import { getUsersByRole } from "./identity-client.js";

interface NotificationInput {
  userId: number;
  type: string;
  title: string;
  message: string;
  ticketId?: number | null;
  ticketNumber?: string | null;
  ticketSubject?: string | null;
}

/** Publica "notification.create" — igual que identity-service (Fase 4), ahora con snapshot del ticket. */
export async function createNotification(input: NotificationInput): Promise<void> {
  await publishEvent(env.RABBITMQ_URL, "notification.create", {
    userId: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    ticketId: input.ticketId ?? null,
    ticketNumber: input.ticketNumber ?? null,
    ticketSubject: input.ticketSubject ?? null,
  });
}

/**
 * Notifica a todos los usuarios activos de un rol (ej. todos los MASTER cuando se crea un
 * ticket). A diferencia del monolito original, ya no hay un `prisma.user.findMany` local — se
 * resuelve por HTTP contra identity-service (ver lib/identity-client.ts), con el mismo token del
 * usuario que originó la acción (puede no ser MASTER — por eso identity-service expone
 * GET /users/by-role/:roleCode sin exigir ese rol, ver Fase 8 en el plan de migración).
 */
export async function notifyRole(
  roleCode: string,
  input: Omit<NotificationInput, "userId">,
  authorization: string,
): Promise<void> {
  const users = await getUsersByRole(roleCode, authorization);
  await Promise.all(users.map((u) => createNotification({ ...input, userId: u.id })));
}
