import type { CatalogSla } from "./catalog-client.js";

// Adaptado desde backend/src/lib/sla.ts: la única diferencia es de dónde viene el tipo de la
// configuración de SLA (antes `SlaConfiguration` de Prisma local; ahora `CatalogSla`, tal como
// lo devuelve catalog-service). La lógica es idéntica — son funciones puras, no tocan la BD.

export interface SlaDates {
  slaResponseDueAt: Date;
  slaResolutionDueAt: Date;
}

/** Calcula las fechas límite de SLA a partir de la configuración activa de la prioridad. */
export function computeSlaDates(createdAt: Date, sla: Pick<CatalogSla, "responseMinutes" | "resolutionHours">): SlaDates {
  return {
    slaResponseDueAt: new Date(createdAt.getTime() + sla.responseMinutes * 60_000),
    slaResolutionDueAt: new Date(createdAt.getTime() + sla.resolutionHours * 3_600_000),
  };
}

export type SlaIndicator = "normal" | "proximo" | "vencido" | "sin-sla";

interface SlaInput {
  slaResolutionDueAt?: Date | null;
  resolvedAt?: Date | null;
  closedAt?: Date | null;
  createdAt?: Date | null;
  statusCode?: string | null;
}

/**
 * Estado visual del SLA:
 * - normal: dentro del límite (o ya resuelto/cerrado a tiempo)
 * - proximo: entre 80% y 100% del plazo transcurrido
 * - vencido: plazo superado (o resuelto después del límite)
 * - sin-sla: sin fecha de SLA configurada
 */
export function slaIndicator(input: SlaInput): SlaIndicator {
  const due = input.slaResolutionDueAt;
  if (!due) return "sin-sla";

  const resolvedAt = input.resolvedAt ?? input.closedAt ?? null;
  if (resolvedAt) {
    return resolvedAt.getTime() <= due.getTime() ? "normal" : "vencido";
  }
  if (input.statusCode === "CANCELADO") return "normal";

  const now = Date.now();
  if (now > due.getTime()) return "vencido";

  const start = input.createdAt ? input.createdAt.getTime() : now;
  const total = due.getTime() - start;
  if (total <= 0) return "vencido";
  if ((now - start) / total >= 0.8) return "proximo";
  return "normal";
}

/** Devuelve el estado del SLA de un ticket (requiere createdAt y el código de estado ya resuelto). */
export function ticketSlaIndicator(ticket: {
  slaResolutionDueAt?: Date | null;
  resolvedAt?: Date | null;
  closedAt?: Date | null;
  createdAt: Date;
  statusCode?: string | null;
}): SlaIndicator {
  return slaIndicator({
    slaResolutionDueAt: ticket.slaResolutionDueAt,
    resolvedAt: ticket.resolvedAt,
    closedAt: ticket.closedAt,
    createdAt: ticket.createdAt,
    statusCode: ticket.statusCode,
  });
}
