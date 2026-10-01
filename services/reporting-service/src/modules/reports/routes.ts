import { Router } from "express";
import { z } from "zod";
import { authenticate, requireRole, validate } from "@helpdesk/common";
import { env } from "../../config/env.js";
import { ROLES, OPEN_STATUSES } from "../../config/constants.js";

// Subconjunto de OPEN_STATUSES usado por el reporte de productividad original: excluye
// NUEVO/PENDIENTE_ASIGNACION porque a esta altura el ticket ya tiene técnico asignado.
const ASSIGNED_OPEN_STATUSES = ["ASIGNADO", "EN_PROCESO", "ESPERA_USUARIO", "REABIERTO"];
import { getAllTickets, type EnrichedTicket, type TicketFilters } from "../../lib/ticketing-client.js";
import { getPriorities } from "../../lib/catalog-client.js";
import { getCompanies } from "../../lib/organization-client.js";
import { getTechnicians } from "../../lib/identity-client.js";

// Adaptado desde backend/src/modules/reports/routes.ts. Mismo cambio de fondo que dashboard/routes.ts:
// no hay `prisma.ticket` local, todo se agrega en memoria sobre la lista ya enriquecida que expone
// ticketing-service. `reportsRouter` sigue exigiendo MASTER en los 5 endpoints, igual que el original.

const requireAuth = authenticate(env.JWT_SECRET);

export const reportsRouter = Router();

reportsRouter.use(requireAuth, requireRole(ROLES.MASTER));

const reportQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  statusCode: z.string().optional(),
  priorityId: z.coerce.number().int().optional(),
  categoryId: z.coerce.number().int().optional(),
  technicianId: z.coerce.number().int().optional(),
  companyId: z.coerce.number().int().optional(),
  month: z.string().optional(), // YYYY-MM
});

function toTicketFilters(q: z.infer<typeof reportQuerySchema>): TicketFilters {
  return {
    from: q.from,
    to: q.to,
    statusCode: q.statusCode,
    priorityId: q.priorityId,
    categoryId: q.categoryId,
    technicianId: q.technicianId,
    companyId: q.companyId,
  };
}

function monthRange(month?: string): { from?: string; to?: string } {
  if (!month) return {};
  const start = new Date(`${month}-01T00:00:00`);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

function avgResolutionMinutes(tickets: EnrichedTicket[]): number {
  const finished = tickets.filter((t) => t.resolvedAt);
  if (finished.length === 0) return 0;
  const total = finished.reduce((acc, t) => acc + (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()) / 60000, 0);
  return Math.round(total / finished.length);
}

// GET /api/reports/tickets
reportsRouter.get("/tickets", validate({ query: reportQuerySchema }), async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof reportQuerySchema>;
    const tickets = await getAllTickets(req.headers.authorization!, toTicketFilters(q));

    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    let slaOk = 0;
    let slaBreached = 0;
    for (const t of tickets) {
      if (t.status) byStatus[t.status.name] = (byStatus[t.status.name] ?? 0) + 1;
      if (t.priority) byPriority[t.priority.name] = (byPriority[t.priority.name] ?? 0) + 1;
      if (t.category) byCategory[t.category.name] = (byCategory[t.category.name] ?? 0) + 1;
      if (t.sla === "vencido") slaBreached += 1;
      else if (t.sla === "normal") slaOk += 1;
    }
    res.json({ total: tickets.length, rows: tickets, byStatus, byPriority, byCategory, sla: { ok: slaOk, breached: slaBreached } });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/productivity — por técnico
reportsRouter.get("/productivity", validate({ query: reportQuerySchema }), async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof reportQuerySchema>;
    const authorization = req.headers.authorization!;
    const range = monthRange(q.month);
    const [technicians, companies, tickets] = await Promise.all([
      getTechnicians(authorization),
      getCompanies(authorization),
      getAllTickets(authorization, range),
    ]);
    const companyById = new Map(companies.map((c) => [c.id, c]));

    const data = technicians.map((t) => {
      const own = tickets.filter((tk) => tk.assignedTechnicianId === t.id);
      return {
        technicianId: t.id,
        technician: t.name,
        company: t.companyId ? (companyById.get(t.companyId)?.name ?? null) : null,
        total: own.length,
        resolved: own.filter((tk) => tk.status?.code === "RESUELTO").length,
        closed: own.filter((tk) => tk.status?.code === "CERRADO").length,
        open: own.filter((tk) => tk.status && ASSIGNED_OPEN_STATUSES.includes(tk.status.code)).length,
        avgResolutionMinutes: avgResolutionMinutes(own),
      };
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/sla — cumplimiento de SLA por prioridad
reportsRouter.get("/sla", validate({ query: reportQuerySchema }), async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof reportQuerySchema>;
    const authorization = req.headers.authorization!;
    const [priorities, tickets] = await Promise.all([
      getPriorities(authorization),
      getAllTickets(authorization, { from: q.from, to: q.to }),
    ]);
    const sorted = priorities.sort((a, b) => a.sortOrder - b.sortOrder);

    const data = sorted.map((p) => {
      const own = tickets.filter((t) => t.priorityId === p.id);
      const ok = own.filter((t) => t.sla === "normal").length;
      const breached = own.filter((t) => t.sla === "vencido").length;
      const pending = own.filter((t) => t.sla === "proximo" || t.sla === "sin-sla").length;
      return {
        priority: p.name,
        color: p.color,
        total: own.length,
        ok,
        breached,
        pending,
        compliancePct: own.length ? Math.round((ok / own.length) * 100) : 100,
        slaConfig: p.sla ? { responseMinutes: p.sla.responseMinutes, resolutionHours: p.sla.resolutionHours } : null,
      };
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/companies — tickets por empresa
reportsRouter.get("/companies", validate({ query: reportQuerySchema }), async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof reportQuerySchema>;
    const authorization = req.headers.authorization!;
    const [companies, tickets] = await Promise.all([getCompanies(authorization), getAllTickets(authorization, { from: q.from, to: q.to })]);

    const data = companies.map((c) => {
      const own = tickets.filter((t) => t.companyId === c.id);
      return {
        company: c.name,
        total: own.length,
        open: own.filter((t) => t.status && OPEN_STATUSES.includes(t.status.code)).length,
        resolved: own.filter((t) => t.status?.code === "RESUELTO" || t.status?.code === "CERRADO").length,
      };
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/export — CSV con los datos del reporte de tickets
reportsRouter.get("/export", validate({ query: reportQuerySchema }), async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof reportQuerySchema>;
    const tickets = await getAllTickets(req.headers.authorization!, toTicketFilters(q));
    const esc = (v: unknown) => `"${(v == null ? "" : String(v)).replace(/"/g, '""')}"`;
    const header = ["Ticket", "Asunto", "Solicitante", "Empresa", "Prioridad", "Técnico", "Estado", "Creado", "Resuelto", "SLA"].join(",");
    const lines = tickets.map((t) =>
      [
        esc(t.ticketNumber), esc(t.subject), esc(t.requesterName), esc(t.company?.name),
        esc(t.priority?.name), esc(t.assignedTechnician?.name), esc(t.status?.name),
        esc(t.createdAt), esc(t.resolvedAt), esc(t.sla),
      ].join(","),
    );
    const csv = "﻿" + [header, ...lines].join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="reporte-tickets-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});
