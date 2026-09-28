import type { Prisma, User } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { ROLES, OPEN_STATUSES } from "../../config/constants.js";
import { createNotification, notifyRole } from "../../lib/notifications.js";
import type { Ticket, TicketStatus, TicketPriority, TicketCategory, TicketSubcategory, Company, Department } from "@prisma/client";

export type FullTicket = Ticket & {
  user: { id: number; name: string; email: string };
  assignedTechnician: { id: number; name: string } | null;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  subcategory: TicketSubcategory | null;
  company: Company | null;
  department: Department | null;
};

export const ticketInclude = {
  user: { select: { id: true, name: true, email: true } },
  assignedTechnician: { select: { id: true, name: true } },
  status: true,
  priority: true,
  category: true,
  subcategory: true,
  company: true,
  department: true,
} satisfies Prisma.TicketInclude;

/** Determina si el usuario puede ver el ticket según su rol. */
export function canAccessTicket(user: User & { role: { code: string } }, ticket: { userId: number; assignedTechnicianId: number | null }): boolean {
  if (user.role.code === ROLES.MASTER) return true;
  if (user.role.code === ROLES.TECNICO) return ticket.assignedTechnicianId === user.id;
  return ticket.userId === user.id;
}

export function canActOnTicket(user: User & { role: { code: string } }, ticket: { userId: number; assignedTechnicianId: number | null }): boolean {
  return canAccessTicket(user, ticket);
}

/** Carga el ticket con relaciones y valida el acceso; si no, lanza. */
export async function getTicketOrThrow(
  id: number,
  user: User & { role: { code: string } },
): Promise<FullTicket> {
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: ticketInclude,
  });
  if (!ticket) {
    const err = new Error("Ticket no encontrado") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  if (!canAccessTicket(user, ticket)) {
    const err = new Error("No tienes permiso para ver este ticket") as Error & { status: number };
    err.status = 403;
    throw err;
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

export function isOpenStatus(code: string): boolean {
  return OPEN_STATUSES.includes(code);
}

export async function getStatusByCode(code: string): Promise<TicketStatus | null> {
  return prisma.ticketStatus.findUnique({ where: { code } });
}

/** Avisa al solicitante del ticket. */
export async function notifyRequester(
  ticket: { id: number; ticketNumber: string; userId: number },
  type: string,
  title: string,
  message: string,
): Promise<void> {
  createNotification({ userId: ticket.userId, type, title, message, ticketId: ticket.id });
}

/** Avisa al técnico asignado. */
export async function notifyTechnician(
  technicianId: number | null | undefined,
  ticket: { id: number; ticketNumber: string },
  type: string,
  title: string,
  message: string,
): Promise<void> {
  if (!technicianId) return;
  createNotification({ userId: technicianId, type, title, message, ticketId: ticket.id });
}

export { notifyRole };
