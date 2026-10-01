import amqp from "amqplib";
import { randomUUID } from "node:crypto";

/**
 * Publicación/consumo de eventos de dominio vía RabbitMQ (exchange topic compartido).
 * Ver docs/plan-migracion-microservicios.md, sección 4.4: esto reemplaza las llamadas
 * síncronas in-process que el monolito hacía a lib/audit.ts / lib/notifications.ts.
 *
 * Formato estándar de evento: { eventId, eventType, occurredAt, payload }.
 */

const EXCHANGE = "helpdesk.events";

export interface DomainEvent<T = unknown> {
  eventId: string;
  eventType: string;
  occurredAt: string;
  payload: T;
}

let connection: amqp.ChannelModel | null = null;
let channel: amqp.Channel | null = null;
let connecting: Promise<amqp.Channel> | null = null;

async function getChannel(rabbitUrl: string): Promise<amqp.Channel> {
  if (channel) return channel;
  if (!connecting) {
    connecting = (async () => {
      connection = await amqp.connect(rabbitUrl);
      const ch = await connection.createChannel();
      await ch.assertExchange(EXCHANGE, "topic", { durable: true });
      channel = ch;
      connection.on("close", () => {
        channel = null;
        connection = null;
      });
      return ch;
    })().finally(() => {
      connecting = null;
    });
  }
  return connecting;
}

/** Publica un evento de dominio. No lanza si RabbitMQ no está disponible — solo registra el error. */
export async function publishEvent<T>(rabbitUrl: string, eventType: string, payload: T): Promise<void> {
  try {
    const ch = await getChannel(rabbitUrl);
    const event: DomainEvent<T> = {
      eventId: randomUUID(),
      eventType,
      occurredAt: new Date().toISOString(),
      payload,
    };
    ch.publish(EXCHANGE, eventType, Buffer.from(JSON.stringify(event)), {
      contentType: "application/json",
      persistent: true,
    });
  } catch (err) {
    console.error(`[events] no se pudo publicar "${eventType}"`, err);
  }
}

/**
 * Suscribe una cola durable a uno o más routing keys del exchange compartido. El handler
 * debe resolver sin lanzar; si lanza, el mensaje se descarta (sin reintento infinito) —
 * política simple adecuada para este entorno local/de desarrollo.
 */
export async function consumeEvents<T = unknown>(
  rabbitUrl: string,
  queueName: string,
  routingKeys: string[],
  handler: (event: DomainEvent<T>) => Promise<void>,
): Promise<void> {
  const ch = await getChannel(rabbitUrl);
  await ch.assertQueue(queueName, { durable: true });
  for (const routingKey of routingKeys) {
    await ch.bindQueue(queueName, EXCHANGE, routingKey);
  }
  await ch.consume(queueName, (msg) => {
    if (!msg) return;
    Promise.resolve()
      .then(() => JSON.parse(msg.content.toString()) as DomainEvent<T>)
      .then((event) => handler(event))
      .then(() => ch.ack(msg))
      .catch((err) => {
        console.error(`[events] error procesando mensaje de "${queueName}"`, err);
        ch.nack(msg, false, false);
      });
  });
}
