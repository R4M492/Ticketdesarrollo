import type { Request } from "express";
import { prisma } from "./prisma.js";

interface AuditInput {
  userId?: number | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  description: string;
  req?: Request;
}

/**
 * Registra una acción en audit_logs (usuario, acción, entidad, IP, user-agent).
 * Returns a promise that resolves in the background — no need to await.
 * Callers can optionally await if they need the audit to be written before responding.
 */
export function logAudit(input: AuditInput): Promise<void> {
  return prisma.auditLog
    .create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId != null ? String(input.entityId) : null,
        description: input.description,
        ipAddress: input.req?.ip ?? null,
        userAgent: input.req?.get("user-agent") ?? null,
      },
    })
    .then(() => {})
    .catch((err) => {
      console.error("[audit]", err);
    });
}
