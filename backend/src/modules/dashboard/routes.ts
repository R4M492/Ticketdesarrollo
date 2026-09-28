import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { ROLES, OPEN_STATUSES } from "../../config/constants.js";
import { authenticate } from "../../middleware/auth.js";

export const dashboardRouter = Router();

dashboardRouter.use(authenticate);

/** Construye el filtro de alcance según el rol. */
function scopeFilter(user: { role: { code: string }; id: number }): Prisma.TicketWhereInput {
  if (user.role.code === ROLES.TECNICO) return { assignedTechnicianId: user.id };
  if (user.role.code === ROLES.USUARIO) return { userId: user.id };
  return {};
}

async function countStatus(user: { role: { code: string }; id: number }, code: string): Promise<number> {
  return prisma.ticket.count({ where: { ...scopeFilter(user), status: { code } } });
}

function isOverdue(t: { slaResolutionDueAt: Date | null; resolvedAt: Date | null; closedAt: Date | null; status: { code: string } }): boolean {
  if (!t.slaResolutionDueAt) return false;
  const end = t.resolvedAt ?? t.closedAt;
  if (end) return end.getTime() > t.slaResolutionDueAt.getTime();
  if (t.status.code === "CANCELADO") return false;
  return Date.now() > t.slaResolutionDueAt.getTime();
}

// GET /api/dashboard/summary
dashboardRouter.get("/summary", async (req, res, next) => {
  try {
    const user = req.user!;
    const filter = scopeFilter(user);

    const [total, nuevos, pendientes, asignados, enProceso, espera, resueltos, cerrados, reabiertos, cancelados] =
      await Promise.all([
        prisma.ticket.count({ where: filter }),
        countStatus(user, "NUEVO"),
        countStatus(user, "PENDIENTE_ASIGNACION"),
        countStatus(user, "ASIGNADO"),
        countStatus(user, "EN_PROCESO"),
        countStatus(user, "ESPERA_USUARIO"),
        countStatus(user, "RESUELTO"),
        countStatus(user, "CERRADO"),
        countStatus(user, "REABIERTO"),
        countStatus(user, "CANCELADO"),
      ]);

    const openTickets = await prisma.ticket.findMany({
      where: { ...filter, status: { code: { in: OPEN_STATUSES } } },
      select: { slaResolutionDueAt: true, resolvedAt: true, closedAt: true, status: { select: { code: true } } },
    });
    const vencidos = openTickets.filter(isOverdue).length;

    // Métricas de tiempo (solo resueltos/cerrados)
    const finished = await prisma.ticket.findMany({
      where: { ...filter, OR: [{ resolvedAt: { not: null } }, { closedAt: { not: null } }] },
      select: { createdAt: true, resolvedAt: true, closedAt: true },
    });
    const avgMinutes = finished.length
      ? Math.round(
          finished.reduce((acc, t) => {
            const end = t.resolvedAt ?? t.closedAt!;
            return acc + (end.getTime() - t.createdAt.getTime()) / 60000;
          }, 0) / finished.length,
        )
      : 0;

    // Productividad mensual (tickets resueltos en el mes actual)
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const resolvedThisMonth = await prisma.ticket.count({
      where: { ...filter, resolvedAt: { gte: monthStart } },
    });

    res.json({
      total,
      nuevos,
      pendientes,
      asignados,
      enProceso,
      espera,
      resueltos,
      cerrados,
      reabiertos,
      cancelados,
      vencidos,
      avgResolutionMinutes: avgMinutes,
      resolvedThisMonth,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/by-status
dashboardRouter.get("/by-status", async (req, res, next) => {
  try {
    const filter = scopeFilter(req.user!);
    const statuses = await prisma.ticketStatus.findMany({
      where: { status: "ACTIVE" },
      orderBy: { sortOrder: "asc" },
    });
    const data = await Promise.all(
      statuses.map(async (s) => ({
        status: s.name,
        code: s.code,
        color: s.color,
        value: await prisma.ticket.count({ where: { ...filter, statusId: s.id } }),
      })),
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/by-priority
dashboardRouter.get("/by-priority", async (req, res, next) => {
  try {
    const filter = scopeFilter(req.user!);
    const priorities = await prisma.ticketPriority.findMany({ orderBy: { sortOrder: "asc" } });
    const data = await Promise.all(
      priorities.map(async (p) => ({
        priority: p.name,
        code: p.code,
        color: p.color,
        value: await prisma.ticket.count({ where: { ...filter, priorityId: p.id } }),
      })),
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/by-category
dashboardRouter.get("/by-category", async (req, res, next) => {
  try {
    const filter = scopeFilter(req.user!);
    const categories = await prisma.ticketCategory.findMany({
      where: { status: "ACTIVE" },
      orderBy: { sortOrder: "asc" },
    });
    const data = await Promise.all(
      categories.map(async (c) => ({
        category: c.name,
        value: await prisma.ticket.count({ where: { ...filter, categoryId: c.id } }),
      })),
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/by-technician — tickets por técnico (MASTER)
dashboardRouter.get("/by-technician", async (req, res, next) => {
  try {
    if (req.user!.role.code !== ROLES.MASTER) {
      return res.json([]);
    }
    const role = await prisma.role.findUnique({ where: { code: ROLES.TECNICO } });
    if (!role) return res.json([]);
    const technicians = await prisma.user.findMany({
      where: { roleId: role.id, status: "ACTIVE" },
      select: { id: true, name: true },
    });
    const data = await Promise.all(
      technicians.map(async (t) => ({
        technician: t.name,
        value: await prisma.ticket.count({ where: { assignedTechnicianId: t.id } }),
      })),
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/per-day — tickets creados por día (últimos 14 días)
dashboardRouter.get("/per-day", async (req, res, next) => {
  try {
    const filter = scopeFilter(req.user!);
    const days = 14;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    const tickets = await prisma.ticket.findMany({
      where: { ...filter, createdAt: { gte: start } },
      select: { createdAt: true },
    });
    const buckets: { day: string; value: number }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      buckets.push({ day: key, value: 0 });
    }
    for (const t of tickets) {
      const key = t.createdAt.toISOString().slice(0, 10);
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
    const filter = scopeFilter(req.user!);
    const months = 6;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

    const tickets = await prisma.ticket.findMany({
      where: { ...filter, resolvedAt: { not: null }, createdAt: { gte: start } },
      select: { createdAt: true, resolvedAt: true },
    });

    const buckets: { month: string; avgMinutes: number; count: number }[] = [];
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
      const key = d.toISOString().slice(0, 7);
      buckets.push({ month: key, avgMinutes: 0, count: 0 });
    }
    const totals: Record<string, { sum: number; count: number }> = {};
    for (const t of tickets) {
      const key = t.createdAt.toISOString().slice(0, 7);
      if (!totals[key]) totals[key] = { sum: 0, count: 0 };
      totals[key].sum += (t.resolvedAt!.getTime() - t.createdAt.getTime()) / 60000;
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
