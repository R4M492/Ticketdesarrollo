import { consumeEvents, type DomainEvent } from "@helpdesk/common";
import { getDb } from "../db/mongo.js";
import { env } from "../config/env.js";

interface AuditLogEventPayload {
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string;
  ipAddress: string | null;
  userAgent: string | null;
}

/** Se suscribe a "audit.log" (publicado hoy por identity-service, ver src/lib/audit.ts ahí) y persiste. */
export async function startAuditConsumer(): Promise<void> {
  await consumeEvents<AuditLogEventPayload>(env.RABBITMQ_URL, "audit-service.audit-log", ["audit.log"], async (event: DomainEvent<AuditLogEventPayload>) => {
    const db = await getDb();
    await db.collection("audit_logs").insertOne({
      ...event.payload,
      createdAt: new Date(event.occurredAt),
    });
  });
  console.log('[audit-service] escuchando eventos "audit.log"');
}
