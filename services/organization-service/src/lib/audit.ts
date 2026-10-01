import type { Request } from "express";
import { publishAuditEvent } from "@helpdesk/common";
import { env } from "../config/env.js";

interface AuditInput {
  userId?: number | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  description: string;
  req?: Request;
}

/** Igual que catalog-service: no tiene acceso a User, así que userName/userEmail van en null. */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    await publishAuditEvent(env.RABBITMQ_URL, {
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId != null ? String(input.entityId) : null,
      description: input.description,
      ipAddress: input.req?.ip ?? null,
      userAgent: input.req?.get("user-agent") ?? null,
    });
  } catch (err) {
    console.error("[audit] no se pudo publicar el evento", err);
  }
}
