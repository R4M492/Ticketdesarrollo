import { publishEvent } from "./events.js";

/**
 * Forma común del evento "audit.log" que cualquier servicio puede publicar. Solo
 * identity-service tiene acceso a la tabla User, así que es el único que puede resolver
 * `userName`/`userEmail` como snapshot (ver services/identity-service/src/lib/audit.ts) —
 * el resto de los servicios publican con esos dos campos en null, y así se muestran en
 * audit-service hasta que exista una razón real para resolverlos (ej. componer con
 * identity-service, fuera de alcance por ahora).
 */
export interface AuditEventPayload {
  userId: number | null;
  userName?: string | null;
  userEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  description: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function publishAuditEvent(rabbitUrl: string, payload: AuditEventPayload): Promise<void> {
  await publishEvent(rabbitUrl, "audit.log", payload);
}
