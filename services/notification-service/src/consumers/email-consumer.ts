import { consumeEvents, type DomainEvent } from "@helpdesk/common";
import { getDb } from "../db/mongo.js";
import { env } from "../config/env.js";
import { mailerConfigured, sendMail } from "../lib/mailer.js";
import { buildEmailHtml } from "../lib/email-template.js";
import type { JobDoc } from "../modules/jobs/routes.js";

interface EmailJobPayload {
  to: string;
  subject: string;
  body: string;
  ticketId: number | null;
  ticketNumber: string | null;
  kind: string;
}

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 3000;
// Probabilidad de fallo simulado — existe para poder demostrar en vivo el camino de reintentos +
// dead-letter queue (ver packages/common/src/events.ts). Se aplica ANTES del envío real, así que
// con SIMULATE_FAILURES=true un correo que "fallaría" nunca llega a intentar mandarse de verdad.
// Desactívalo (SIMULATE_FAILURES=false) para que el envío real nunca falle a propósito.
const SIMULATED_FAILURE_RATE = 0.4;

/** Se suscribe a "email.send" (publicado por ticketing-service al crear un ticket) y simula el envío. */
export async function startEmailConsumer(): Promise<void> {
  await consumeEvents<EmailJobPayload>(
    env.RABBITMQ_URL,
    "notification-service.email-send",
    ["email.send"],
    async (event: DomainEvent<EmailJobPayload>, meta) => {
      const db = await getDb();
      const jobs = db.collection<JobDoc>("jobs");
      await jobs.updateOne(
        { _id: event.eventId },
        {
          $set: {
            type: "EMAIL_SEND",
            status: meta.attempt > 1 ? "RETRYING" : "PROCESSING",
            attempt: meta.attempt,
            maxAttempts: MAX_ATTEMPTS,
            ticketId: event.payload.ticketId,
            to: event.payload.to,
            subject: event.payload.subject,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date(event.occurredAt), lastError: null, completedAt: null },
        },
        { upsert: true },
      );

      if (env.SIMULATE_FAILURES && Math.random() < SIMULATED_FAILURE_RATE) {
        throw new Error("Fallo simulado del proveedor de correo (timeout de SMTP)");
      }

      if (mailerConfigured) {
        const html = buildEmailHtml({
          heading: event.payload.subject,
          bodyText: event.payload.body,
          ticketNumber: event.payload.ticketNumber,
        });
        await sendMail({ to: event.payload.to, subject: event.payload.subject, text: event.payload.body, html });
        console.log(`[email] enviado de verdad a ${event.payload.to}: "${event.payload.subject}"`);
      } else {
        console.log(`[email] SMTP no configurado — simulado para ${event.payload.to}: "${event.payload.subject}"`);
      }

      await jobs.updateOne(
        { _id: event.eventId },
        { $set: { status: "COMPLETED", updatedAt: new Date(), completedAt: new Date() } },
      );
    },
    {
      maxAttempts: MAX_ATTEMPTS,
      retryDelayMs: RETRY_DELAY_MS,
      onExhausted: async (event, err) => {
        const db = await getDb();
        await db.collection<JobDoc>("jobs").updateOne(
          { _id: event.eventId },
          { $set: { status: "FAILED", lastError: String((err as Error)?.message ?? err), updatedAt: new Date() } },
        );
      },
    },
  );
  console.log('[notification-service] escuchando eventos "email.send"');
}
