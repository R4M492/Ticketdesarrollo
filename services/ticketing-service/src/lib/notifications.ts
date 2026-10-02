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

/**
 * Publica "email.send" — lo consume notification-service (ver
 * services/notification-service/src/consumers/email-consumer.ts), que simula el envío y
 * registra el progreso como un "trabajo" consultable vía GET /api/jobs. A diferencia de
 * "notification.create" (persistencia interna, sin reintentos visibles), este job tiene una
 * tasa de fallo simulada a propósito: existe para demostrar el camino de reintentos/DLQ de
 * packages/common/src/events.ts, no para enviar correos reales (no hay proveedor SMTP
 * configurado en este entorno).
 */
export interface TicketConfirmationDetails {
  category?: string | null;
  subcategory?: string | null;
  priority?: string | null;
  location?: string | null;
  device?: string | null;
  inventoryNumber?: string | null;
  description: string;
}

export async function sendTicketConfirmationEmail(
  ticket: { id: number; ticketNumber: string; subject: string },
  to: string,
  details?: TicketConfirmationDetails,
): Promise<void> {
  const lines = [`Tu ticket "${ticket.subject}" fue registrado con el número ${ticket.ticketNumber}.`];
  // El detalle completo del formulario solo se incluye al crear el ticket (details presente); un
  // reenvío manual (POST /:id/resend-confirmation) no lo vuelve a pedir y manda solo la confirmación.
  if (details) {
    lines.push("");
    lines.push("Detalle de tu solicitud:");
    if (details.category) lines.push(`• Categoría: ${details.category}${details.subcategory ? ` / ${details.subcategory}` : ""}`);
    if (details.priority) lines.push(`• Prioridad: ${details.priority}`);
    if (details.location) lines.push(`• Ubicación: ${details.location}`);
    if (details.device) lines.push(`• Equipo / dispositivo: ${details.device}`);
    if (details.inventoryNumber) lines.push(`• Inventario: ${details.inventoryNumber}`);
    lines.push(`• Descripción: ${details.description}`);
    lines.push("");
  }
  lines.push("Te avisaremos por este medio cuando tenga una actualización.");

  await publishEvent(env.RABBITMQ_URL, "email.send", {
    to,
    subject: `Confirmación de ticket ${ticket.ticketNumber}`,
    body: lines.join("\n"),
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
    kind: "TICKET_CREATED",
  });
}
