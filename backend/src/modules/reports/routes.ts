import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { ROLES } from "../../config/constants.js";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";
import { ticketInclude } from "../tickets/helpers.js";
import { slaIndicator, ticketSlaIndicator } from "../../lib/sla.js";

export const reportsRouter = Router();

reportsRouter.use(authenticate, requireRole(ROLES.MASTER));

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

function dateFilter(q: Record<string, unknown>): Prisma.DateTimeFilter | undefined {
  if (!q.from && !q.to) return undefined;
  const f: Prisma.DateTimeFilter = {};
  if (q.from) f.gte = new Date(String(q.from));
  if (q.to) f.lte = new Date(String(q.to));
  return f;
}

// GET /api/reports/tickets
reportsRouter.get("/tickets", validate({ query: reportQuerySchema }), async (req, res, next) => {
  try {
    const q = req.query;
    const where: Prisma.TicketWhereInput = {};
    const createdAt = dateFilter(q);
    if (createdAt) where.createdAt = createdAt;
    if (q.statusCode) where.status = { code: String(q.statusCode) };
    if (q.priorityId) where.priorityId = Number(q.priorityId);
    if (q.categoryId) where.categoryId = Number(q.categoryId);
    if (q.technicianId) where.assignedTechnicianId = Number(q.technicianId);
    if (q.companyId) where.companyId = Number(q.companyId);

    const [rows, total] = await Promise.all([
      prisma.ticket.findMany({ where, include: ticketInclude, orderBy: { createdAt: "desc" } }),
      prisma.ticket.count({ where }),
    ]);

    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    let slaOk = 0;
    let slaBreached = 0;
    for (const t of rows) {
      byStatus[t.status.name] = (byStatus[t.status.name] ?? 0) + 1;
      byPriority[t.priority.name] = (byPriority[t.priority.name] ?? 0) + 1;
      byCategory[t.category.name] = (byCategory[t.category.name] ?? 0) + 1;
      const ind = ticketSlaIndicator(t);
      if (ind === "vencido") slaBreached += 1;
      else if (ind === "normal") slaOk += 1;
    }
    res.json({
      total,
      rows: rows.map((t) => ({ ...t, sla: ticketSlaIndicator(t) })),
      byStatus,
      byPriority,
      byCategory,
      sla: { ok: slaOk, breached: slaBreached },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/productivity — por técnico
reportsRouter.get("/productivity", validate({ query: reportQuerySchema }), async (req, res, next) => {
  try {
    const q = req.query;
    const role = await prisma.role.findUnique({ where: { code: ROLES.TECNICO } });
    if (!role) return res.json([]);
    const technicians = await prisma.user.findMany({
      where: { roleId: role.id },
      include: { company: true },
      orderBy: { name: "asc" },
    });

    const monthStart = q.month ? new Date(`${q.month}-01T00:00:00`) : null;
    const monthEnd = monthStart
      ? new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
      : null;

    const data = await Promise.all(
      technicians.map(async (t) => {
        const base: Prisma.TicketWhereInput = { assignedTechnicianId: t.id };
        if (monthStart && monthEnd) {
          base.createdAt = { gte: monthStart, lt: monthEnd };
        }
        const total = await prisma.ticket.count({ where: base });
        const resolved = await prisma.ticket.count({ where: { ...base, status: { code: "RESUELTO" } } });
        const closed = await prisma.ticket.count({ where: { ...base, status: { code: "CERRADO" } } });
        const open = await prisma.ticket.count({
          where: {
            ...base,
            status: { code: { in: ["ASIGNADO", "EN_PROCESO", "ESPERA_USUARIO", "REABIERTO"] } },
          },
        });

        const finished = await prisma.ticket.findMany({
          where: { ...base, resolvedAt: { not: null } },
          select: { createdAt: true, resolvedAt: true },
        });
        const avgMinutes = finished.length
          ? Math.round(
              finished.reduce((acc, f) => acc + (f.resolvedAt!.getTime() - f.createdAt.getTime()) / 60000, 0) /
                finished.length,
            )
          : 0;

        return {
          technicianId: t.id,
          technician: t.name,
          company: t.company?.name ?? null,
          total,
          resolved,
          closed,
          open,
          avgResolutionMinutes: avgMinutes,
        };
      }),
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/sla — cumplimiento de SLA por prioridad
reportsRouter.get("/sla", validate({ query: reportQuerySchema }), async (req, res, next) => {
  try {
    const q = req.query;
    const priorities = await prisma.ticketPriority.findMany({
      include: { sla: true },
      orderBy: { sortOrder: "asc" },
    });
    const createdAt = dateFilter(q);
    const data = await Promise.all(
      priorities.map(async (p) => {
        const where: Prisma.TicketWhereInput = { priorityId: p.id };
        if (createdAt) where.createdAt = createdAt;
        const tickets = await prisma.ticket.findMany({
          where,
          select: {
            slaResolutionDueAt: true,
            resolvedAt: true,
            closedAt: true,
            status: { select: { code: true } },
            createdAt: true,
          },
        });
        let ok = 0;
        let breached = 0;
        let pending = 0;
        for (const t of tickets) {
          const ind = slaIndicator({
            slaResolutionDueAt: t.slaResolutionDueAt,
            resolvedAt: t.resolvedAt,
            closedAt: t.closedAt,
            createdAt: t.createdAt,
            statusCode: t.status.code,
          });
          if (ind === "vencido") breached += 1;
          else if (ind === "normal") ok += 1;
          else pending += 1;
        }
        const total = tickets.length;
        return {
          priority: p.name,
          color: p.color,
          total,
          ok,
          breached,
          pending,
          compliancePct: total ? Math.round((ok / total) * 100) : 100,
          slaConfig: p.sla ? { responseMinutes: p.sla.responseMinutes, resolutionHours: p.sla.resolutionHours } : null,
        };
      }),
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/companies — tickets por empresa
reportsRouter.get("/companies", validate({ query: reportQuerySchema }), async (req, res, next) => {
  try {
    const q = req.query;
    const companies = await prisma.company.findMany({ orderBy: { name: "asc" } });
    const createdAt = dateFilter(q);
    const data = await Promise.all(
      companies.map(async (c) => {
        const where: Prisma.TicketWhereInput = { companyId: c.id };
        if (createdAt) where.createdAt = createdAt;
        const total = await prisma.ticket.count({ where });
        const open = await prisma.ticket.count({
          where: { ...where, status: { code: { in: ["NUEVO", "PENDIENTE_ASIGNACION", "ASIGNADO", "EN_PROCESO", "ESPERA_USUARIO", "REABIERTO"] } } },
        });
        const resolved = await prisma.ticket.count({
          where: { ...where, OR: [{ status: { code: "RESUELTO" } }, { status: { code: "CERRADO" } }] },
        });
        return { company: c.name, total, open, resolved };
      }),
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/export — CSV con los datos del reporte de tickets
reportsRouter.get("/export", validate({ query: reportQuerySchema }), async (req, res, next) => {
  try {
    const q = req.query;
    const where: Prisma.TicketWhereInput = {};
    const createdAt = dateFilter(q);
    if (createdAt) where.createdAt = createdAt;
    if (q.statusCode) where.status = { code: String(q.statusCode) };
    if (q.priorityId) where.priorityId = Number(q.priorityId);
    if (q.technicianId) where.assignedTechnicianId = Number(q.technicianId);
    if (q.companyId) where.companyId = Number(q.companyId);

    const rows = await prisma.ticket.findMany({ where, include: ticketInclude, orderBy: { createdAt: "desc" } });
    const esc = (v: unknown) => `"${(v == null ? "" : String(v)).replace(/"/g, '""')}"`;
    const header = ["Ticket", "Asunto", "Solicitante", "Empresa", "Prioridad", "Técnico", "Estado", "Creado", "Resuelto", "SLA"].join(",");
    const lines = rows.map((t) =>
      [
        esc(t.ticketNumber), esc(t.subject), esc(t.requesterName), esc(t.company?.name),
        esc(t.priority.name), esc(t.assignedTechnician?.name), esc(t.status.name),
        esc(t.createdAt.toISOString()), esc(t.resolvedAt?.toISOString()), esc(ticketSlaIndicator(t)),
      ].join(","),
    );
    const csv = "\uFEFF" + [header, ...lines].join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="reporte-tickets-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});
