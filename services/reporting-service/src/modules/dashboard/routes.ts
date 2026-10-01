import { Router } from "express";
import { authenticate } from "@helpdesk/common";
import { env } from "../../config/env.js";
import { ROLES, OPEN_STATUSES } from "../../config/constants.js";
import { getAllTickets, type EnrichedTicket } from "../../lib/ticketing-client.js";
import { getStatuses, getPriorities, getCategories } from "../../lib/catalog-client.js";
import { getTechnicians } from "../../lib/identity-client.js";

// Adaptado desde backend/src/modules/dashboard/routes.ts. Cambio principal: no hay `prisma.ticket`
// local — se trae la lista de tickets ya enriquecida desde ticketing-service (ver
// lib/ticketing-client.ts) y todo se agrega en memoria aquí. El alcance por rol (técnico ve solo
// lo suyo, usuario solo lo suyo) lo sigue aplicando ticketing-service, no este servicio: se
// reenvía el mismo token, así que no hace falta reimplementar `scopeFilter`.

const requireAuth = authenticate(env.JWT_SECRET);

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

function avgResolutionMinutes(tickets: EnrichedTicket[]): number {
  const finished = tickets.filter((t) => t.resolvedAt || t.closedAt);
  if (finished.length === 0) return 0;
  const totalMinutes = finished.reduce((acc, t) => {
    const end = new Date((t.resolvedAt ?? t.closedAt)!).getTime();
    return acc + (end - new Date(t.createdAt).getTime()) / 60000;
  }, 0);
  return Math.round(totalMinutes / finished.length);
}

// GET /api/dashboard/summary
dashboardRouter.get("/summary", async (req, res, next) => {
  try {
    const authorization = req.headers.authorization!;
    const tickets = await getAllTickets(authorization);

    const countByCode = (code: string) => tickets.filter((t) => t.status?.code === code).length;
    const vencidos = tickets.filter((t) => t.status && OPEN_STATUSES.includes(t.status.code) && t.sla === "vencido").length;

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const resolvedThisMonth = tickets.filter((t) => t.resolvedAt && new Date(t.resolvedAt) >= monthStart).length;

    res.json({
      total: tickets.length,
      nuevos: countByCode("NUEVO"),
      pendientes: countByCode("PENDIENTE_ASIGNACION"),
      asignados: countByCode("ASIGNADO"),
      enProceso: countByCode("EN_PROCESO"),
      espera: countByCode("ESPERA_USUARIO"),
      resueltos: countByCode("RESUELTO"),
      cerrados: countByCode("CERRADO"),
      reabiertos: countByCode("REABIERTO"),
      cancelados: countByCode("CANCELADO"),
      vencidos,
      avgResolutionMinutes: avgResolutionMinutes(tickets),
      resolvedThisMonth,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/by-status
dashboardRouter.get("/by-status", async (req, res, next) => {
  try {
    const authorization = req.headers.authorization!;
    const [statuses, tickets] = await Promise.all([getStatuses(authorization), getAllTickets(authorization)]);
    const active = statuses.filter((s) => s.status === "ACTIVE").sort((a, b) => a.sortOrder - b.sortOrder);
    res.json(active.map((s) => ({ status: s.name, code: s.code, color: s.color, value: tickets.filter((t) => t.statusId === s.id).length })));
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/by-priority
dashboardRouter.get("/by-priority", async (req, res, next) => {
  try {
    const authorization = req.headers.authorization!;
    const [priorities, tickets] = await Promise.all([getPriorities(authorization), getAllTickets(authorization)]);
    const sorted = priorities.sort((a, b) => a.sortOrder - b.sortOrder);
    res.json(sorted.map((p) => ({ priority: p.name, code: p.code, color: p.color, value: tickets.filter((t) => t.priorityId === p.id).length })));
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/by-category
dashboardRouter.get("/by-category", async (req, res, next) => {
  try {
    const authorization = req.headers.authorization!;
    const [categories, tickets] = await Promise.all([getCategories(authorization), getAllTickets(authorization)]);
    const active = categories.filter((c) => c.status === "ACTIVE").sort((a, b) => a.sortOrder - b.sortOrder);
    res.json(active.map((c) => ({ category: c.name, value: tickets.filter((t) => t.categoryId === c.id).length })));
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/by-technician — tickets por técnico (MASTER)
dashboardRouter.get("/by-technician", async (req, res, next) => {
  try {
    if (req.user!.role !== ROLES.MASTER) return res.json([]);
    const authorization = req.headers.authorization!;
    const [technicians, tickets] = await Promise.all([getTechnicians(authorization), getAllTickets(authorization)]);
    const active = technicians.filter((t) => t.status === "ACTIVE");
    res.json(active.map((t) => ({ technician: t.name, value: tickets.filter((tk) => tk.assignedTechnicianId === t.id).length })));
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/per-day — tickets creados por día (últimos 14 días)
dashboardRouter.get("/per-day", async (req, res, next) => {
  try {
    const days = 14;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    const tickets = await getAllTickets(req.headers.authorization!, { from: start.toISOString() });
    const buckets: { day: string; value: number }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      buckets.push({ day: d.toISOString().slice(0, 10), value: 0 });
    }
    for (const t of tickets) {
      const key = new Date(t.createdAt).toISOString().slice(0, 10);
      const bucket = buckets.find((b) => b.day === key);
      if (bucket) bucket.value += 1;
    }
    res.json(buckets);
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/avg-resolution — tendencia mensual (últimos 6 meses)
dashboardRouter.get("/avg-resolution", async (req, res, next) => {
  try {
    const months = 6;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

    const tickets = (await getAllTickets(req.headers.authorization!, { from: start.toISOString() })).filter((t) => t.resolvedAt);

    const buckets: { month: string; avgMinutes: number; count: number }[] = [];
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
      buckets.push({ month: d.toISOString().slice(0, 7), avgMinutes: 0, count: 0 });
    }
    const totals: Record<string, { sum: number; count: number }> = {};
    for (const t of tickets) {
      const key = new Date(t.createdAt).toISOString().slice(0, 7);
      if (!totals[key]) totals[key] = { sum: 0, count: 0 };
      totals[key].sum += (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()) / 60000;
      totals[key].count += 1;
    }
    for (const b of buckets) {
      const t = totals[b.month];
      if (t && t.count > 0) {
        b.avgMinutes = Math.round(t.sum / t.count);
        b.count = t.count;
      }
    }
    res.json(buckets);
  } catch (err) {
    next(err);
  }
});
