import type { Request } from "express";
import { publishAuditEvent } from "@helpdesk/common";
import { prisma } from "./prisma.js";
import { env } from "../config/env.js";

interface AuditInput {
  userId?: number | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  description: string;
  req?: Request;
}

/**
 * Fase 3: ya no escribe directo a AuditLog (esa tabla ahora vive en audit-service/MongoDB,
 * fuera del alcance de este servicio). En vez de eso, publica un evento "audit.log" a
 * RabbitMQ que audit-service consume y persiste — ver packages/common/src/events.ts y
 * services/audit-service/src/consumers/audit-consumer.ts.
 *
 * Se resuelve nombre/correo del usuario aquí (identity-service sí tiene esa data) y se
 * incluyen en el evento como "snapshot" — event-carried state transfer, para que
 * audit-service pueda mostrar quién hizo la acción sin tener que llamar de vuelta a este
 * servicio en cada lectura (ver plan de migración, sección 4.3).
 */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    let userSnapshot: { name: string; email: string } | null = null;
    if (input.userId) {
      userSnapshot = await prisma.user.findUnique({
        where: { id: input.userId },
        select: { name: true, email: true },
      });
    }
    await publishAuditEvent(env.RABBITMQ_URL, {
      userId: input.userId ?? null,
      userName: userSnapshot?.name ?? null,
      userEmail: userSnapshot?.email ?? null,
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
