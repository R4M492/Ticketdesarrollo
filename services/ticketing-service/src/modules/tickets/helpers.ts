import type { Ticket } from "@prisma/client";
import { HttpError } from "@helpdesk/common";
import { prisma } from "../../lib/prisma.js";
import { ROLES } from "../../config/constants.js";
import { getStatuses, type CatalogStatus } from "../../lib/catalog-client.js";
import { createNotification, notifyRole } from "../../lib/notifications.js";

// Adaptado desde backend/src/modules/tickets/helpers.ts. Cambios respecto al original:
// - `ticketInclude`/`FullTicket` desaparecen: ya no existe un `include` de Prisma que traiga
//   usuario/categoría/prioridad/estado/empresa/depto (viven en otras bases). Ver lib/enrich.ts.
// - `getTicketOrThrow` YA NO lanza un `Error` plano con `.status` agregado a mano — ese fue
//   exactamente el bug real encontrado en la Fase 0 (backend/src/middleware/error.ts no lo
//   reconocía y devolvía 500 en vez de 403/404). Aquí usa `HttpError` de @helpdesk/common desde
//   el día uno.
// - `getStatusByCode` ya no consulta una tabla local: trae el catálogo completo de
//   catalog-service y busca por código (lista de 9 estados, no vale la pena optimizar más).
// - `canAccessTicket` recibe `{ sub, role }` (el payload del JWT), no el User completo.

export function canAccessTicket(
  user: { sub: number; role: string },
  ticket: { userId: number; assignedTechnicianId: number | null },
): boolean {
  if (user.role === ROLES.MASTER) return true;
  if (user.role === ROLES.TECNICO) return ticket.assignedTechnicianId === user.sub;
  return ticket.userId === user.sub;
}

export function canActOnTicket(user: { sub: number; role: string }, ticket: { userId: number; assignedTechnicianId: number | null }): boolean {
  return canAccessTicket(user, ticket);
}

/** Carga el ticket (solo columnas propias, sin relaciones) y valida el acceso; si no, lanza. */
export async function getTicketOrThrow(id: number, user: { sub: number; role: string }): Promise<Ticket> {
  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) {
    throw new HttpError(404, "Ticket no encontrado");
  }
  if (!canAccessTicket(user, ticket)) {
    throw new HttpError(403, "No tienes permiso para ver este ticket");
  }
  return ticket;
}

/** Mapa de transiciones de estado permitidas. */
export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  NUEVO: ["PENDIENTE_ASIGNACION", "ASIGNADO", "CANCELADO"],
  PENDIENTE_ASIGNACION: ["ASIGNADO", "CANCELADO"],
  ASIGNADO: ["EN_PROCESO", "CANCELADO"],
  EN_PROCESO: ["ESPERA_USUARIO", "RESUELTO", "CANCELADO"],
  ESPERA_USUARIO: ["EN_PROCESO", "RESUELTO", "CANCELADO"],
  RESUELTO: ["CERRADO", "REABIERTO"],
  CERRADO: ["REABIERTO"],
  REABIERTO: ["ASIGNADO", "EN_PROCESO", "CANCELADO"],
  CANCELADO: [],
};

/** Transiciones manuales que puede ejecutar un técnico asignado (vía endpoint de estado). */
export const TECHNICIAN_MANUAL_TRANSITIONS: Record<string, string[]> = {
  ASIGNADO: ["EN_PROCESO"],
  EN_PROCESO: ["ESPERA_USUARIO"],
  ESPERA_USUARIO: ["EN_PROCESO"],
  REABIERTO: ["EN_PROCESO"],
};

export async function getStatusByCode(code: string, authorization: string): Promise<CatalogStatus | null> {
  const statuses = await getStatuses(authorization);
  return statuses.find((s) => s.code === code) ?? null;
}

/** Resuelve el estado actual de un ticket a partir de su statusId (sin relación local a TicketStatus). */
export async function getStatusById(id: number, authorization: string): Promise<CatalogStatus | null> {
  const statuses = await getStatuses(authorization);
  return statuses.find((s) => s.id === id) ?? null;
}

/** Avisa al solicitante del ticket. */
export async function notifyRequester(
  ticket: { id: number; ticketNumber: string; subject: string; userId: number },
  type: string,
  title: string,
  message: string,
): Promise<void> {
  await createNotification({ userId: ticket.userId, type, title, message, ticketId: ticket.id, ticketNumber: ticket.ticketNumber, ticketSubject: ticket.subject });
}

/** Avisa al técnico asignado. */
export async function notifyTechnician(
  technicianId: number | null | undefined,
  ticket: { id: number; ticketNumber: string; subject: string },
  type: string,
  title: string,
  message: string,
): Promise<void> {
  if (!technicianId) return;
  await createNotification({ userId: technicianId, type, title, message, ticketId: ticket.id, ticketNumber: ticket.ticketNumber, ticketSubject: ticket.subject });
}

export { notifyRole };
