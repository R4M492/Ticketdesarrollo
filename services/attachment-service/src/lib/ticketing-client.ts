import { HttpError } from "@helpdesk/common";
import { env } from "../config/env.js";

export interface TicketRef {
  id: number;
  ticketNumber: string;
  userId: number;
  assignedTechnicianId: number | null;
}

/**
 * attachment-service no tiene Ticket en su base — no puede reimplementar `canAccessTicket`
 * (¿el usuario puede ver este ticket?) sin duplicar esa lógica de ticketing-service. En vez de
 * eso, delega: pide el ticket a ticketing-service con el mismo token del request original. Si
 * ticketing-service responde 403/404 (ya aplicó su propia `getTicketOrThrow`, ver Fase 8), este
 * servicio propaga el mismo error — nunca decide por su cuenta si alguien puede ver un ticket.
 */
export async function getTicketOrThrow(id: number, authorization: string): Promise<TicketRef> {
  const res = await fetch(`${env.TICKETING_SERVICE_URL}/api/tickets/${id}`, {
    headers: { Authorization: authorization },
  });
  if (res.status === 404) throw new HttpError(404, "Ticket no encontrado");
  if (res.status === 403) throw new HttpError(403, "No tienes permiso para ver este ticket");
  if (!res.ok) throw new HttpError(502, "No se pudo validar el ticket con ticketing-service");
  return (await res.json()) as TicketRef;
}
