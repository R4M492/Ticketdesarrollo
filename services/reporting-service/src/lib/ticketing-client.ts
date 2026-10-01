import { env } from "../config/env.js";

/**
 * reporting-service NO mantiene su propia copia de los tickets (ver nota de diseño en
 * modules/dashboard/routes.ts): reutiliza directamente `GET /api/tickets` de ticketing-service,
 * que ya devuelve cada ticket enriquecido (status/priority/category/company/user resueltos) —
 * exactamente los campos que hacen falta para agregar. Se reenvía el token del usuario original,
 * así que el alcance por rol (técnico ve solo lo suyo, usuario solo lo suyo) lo aplica
 * ticketing-service automáticamente, igual que en cualquier otra pantalla.
 */

export interface EnrichedTicket {
  id: number;
  ticketNumber: string;
  subject: string;
  requesterName: string;
  requesterEmail: string;
  userId: number;
  categoryId: number;
  subcategoryId: number | null;
  priorityId: number;
  statusId: number;
  companyId: number | null;
  departmentId: number | null;
  assignedTechnicianId: number | null;
  createdAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  slaResolutionDueAt: string | null;
  slaResponseDueAt: string | null;
  status: { id: number; code: string; name: string; color: string } | null;
  priority: { id: number; code: string; name: string; color: string; sla: { responseMinutes: number; resolutionHours: number } | null } | null;
  category: { id: number; name: string } | null;
  subcategory: { id: number; name: string } | null;
  company: { id: number; name: string } | null;
  department: { id: number; name: string } | null;
  user: { id: number; name: string; email: string } | null;
  assignedTechnician: { id: number; name: string } | null;
  sla: "normal" | "proximo" | "vencido" | "sin-sla";
}

export interface TicketFilters {
  from?: string;
  to?: string;
  statusCode?: string;
  priorityId?: number;
  categoryId?: number;
  technicianId?: number;
  companyId?: number;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 20; // hasta 2000 tickets — de sobra para este sistema (ver nota de diseño)

/** Trae TODOS los tickets (paginando por dentro) que cumplan los filtros, respetando el alcance del token. */
export async function getAllTickets(authorization: string, filters: TicketFilters = {}): Promise<EnrichedTicket[]> {
  const all: EnrichedTicket[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) params.set(key, String(value));
    }
    const res = await fetch(`${env.TICKETING_SERVICE_URL}/api/tickets?${params.toString()}`, {
      headers: { Authorization: authorization },
    });
    if (!res.ok) throw new Error(`ticketing-service /api/tickets respondió ${res.status}`);
    const body = (await res.json()) as { data: EnrichedTicket[]; total: number };
    all.push(...body.data);
    if (all.length >= body.total || body.data.length === 0) break;
  }
  return all;
}
