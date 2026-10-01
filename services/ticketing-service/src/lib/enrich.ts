import type { Ticket } from "@prisma/client";
import { getCategories, getPriorities, getStatuses, type CatalogCategory, type CatalogPriority, type CatalogStatus } from "./catalog-client.js";
import { getCompanies, getDepartments, type OrgCompany, type OrgDepartment } from "./organization-client.js";
import { lookupUsers, type UserLookup } from "./identity-client.js";
import { ticketSlaIndicator } from "./sla.js";

/**
 * Capa de composición ("API composition", plan de migración sección 4.3): Ticket solo guarda IDs
 * sueltos hacia identity-service/catalog-service/organization-service (no hay `include` de Prisma
 * posible entre bases distintas). Esta capa junta, en un puñado de llamadas HTTP en lote — nunca
 * una por ticket — los datos necesarios para reconstruir la misma forma anidada que el monolito
 * original devolvía (ticket.status, ticket.priority, ticket.category, ticket.user, etc.).
 */

export interface EnrichContext {
  categoriesById: Map<number, CatalogCategory>;
  subcategoriesById: Map<number, CatalogCategory["subcategories"][number]>;
  prioritiesById: Map<number, CatalogPriority>;
  statusesById: Map<number, CatalogStatus>;
  statusesByCode: Map<string, CatalogStatus>;
  companiesById: Map<number, OrgCompany>;
  departmentsById: Map<number, OrgDepartment>;
  usersById: Map<number, UserLookup>;
}

/** Carga catálogo + organización completos (listas pequeñas) y los usuarios de los tickets dados. */
export async function buildEnrichContext(tickets: Ticket[], authorization: string): Promise<EnrichContext> {
  const [categories, priorities, statuses, companies, departments] = await Promise.all([
    getCategories(authorization),
    getPriorities(authorization),
    getStatuses(authorization),
    getCompanies(authorization),
    getDepartments(authorization),
  ]);

  const userIds = new Set<number>();
  for (const t of tickets) {
    userIds.add(t.userId);
    if (t.assignedTechnicianId) userIds.add(t.assignedTechnicianId);
  }
  const users = await lookupUsers([...userIds], authorization);

  const subcategoriesById = new Map<number, CatalogCategory["subcategories"][number]>();
  for (const c of categories) {
    for (const sub of c.subcategories) subcategoriesById.set(sub.id, sub);
  }

  return {
    categoriesById: new Map(categories.map((c) => [c.id, c])),
    subcategoriesById,
    prioritiesById: new Map(priorities.map((p) => [p.id, p])),
    statusesById: new Map(statuses.map((s) => [s.id, s])),
    statusesByCode: new Map(statuses.map((s) => [s.code, s])),
    companiesById: new Map(companies.map((c) => [c.id, c])),
    departmentsById: new Map(departments.map((d) => [d.id, d])),
    usersById: new Map(users.map((u) => [u.id, u])),
  };
}

function toUserRef(id: number | null, ctx: EnrichContext): { id: number; name: string; email: string } | null {
  if (id == null) return null;
  const u = ctx.usersById.get(id);
  return u ? { id: u.id, name: u.name, email: u.email } : { id, name: "Usuario desconocido", email: "" };
}

/** Compone un ticket crudo (solo IDs) con sus relaciones resueltas — misma forma que el monolito. */
export function enrichTicket(ticket: Ticket, ctx: EnrichContext) {
  const status = ctx.statusesById.get(ticket.statusId) ?? null;
  const priority = ctx.prioritiesById.get(ticket.priorityId) ?? null;
  const category = ctx.categoriesById.get(ticket.categoryId) ?? null;
  const subcategory = ticket.subcategoryId ? (ctx.subcategoriesById.get(ticket.subcategoryId) ?? null) : null;
  const company = ticket.companyId ? (ctx.companiesById.get(ticket.companyId) ?? null) : null;
  const department = ticket.departmentId ? (ctx.departmentsById.get(ticket.departmentId) ?? null) : null;
  const user = toUserRef(ticket.userId, ctx);
  const assignedTechnician = toUserRef(ticket.assignedTechnicianId, ctx);

  return {
    ...ticket,
    status,
    priority,
    category,
    subcategory,
    company,
    department,
    user,
    assignedTechnician,
    sla: ticketSlaIndicator({
      slaResolutionDueAt: ticket.slaResolutionDueAt,
      resolvedAt: ticket.resolvedAt,
      closedAt: ticket.closedAt,
      createdAt: ticket.createdAt,
      statusCode: status?.code ?? null,
    }),
  };
}

export async function enrichTickets(tickets: Ticket[], authorization: string) {
  const ctx = await buildEnrichContext(tickets, authorization);
  return tickets.map((t) => enrichTicket(t, ctx));
}
