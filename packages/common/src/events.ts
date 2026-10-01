import amqp from "amqplib";
import { randomUUID } from "node:crypto";

/**
 * Publicación/consumo de eventos de dominio vía RabbitMQ (exchange topic compartido).
 * Ver docs/plan-migracion-microservicios.md, sección 4.4: esto reemplaza las llamadas
 * síncronas in-process que el monolito hacía a lib/audit.ts / lib/notifications.ts.
 *
 * Formato estándar de evento: { eventId, eventType, occurredAt, payload }.
 *
 * Reintentos y dead-letter queue: si el handler de `consumeEvents` lanza, el mensaje no se
 * descarta — se reencola con backoff (cola `<queueName>.retry`, con TTL creciente por intento
 * y `x-dead-letter-exchange` apuntando de vuelta a `queueName` por el exchange por defecto) hasta
 * agotar `maxAttempts`. Al agotarlos, el mensaje se mueve a `<queueName>.dlq` (dead-letter queue,
 * durable, para inspección manual) y se invoca `onExhausted` si se proporcionó, para que el
 * servicio consumidor pueda marcar su propio estado de "trabajo" como fallido.
 */

const EXCHANGE = "helpdesk.events";
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 3000;

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

/**
 * Publica un evento de dominio. No lanza si RabbitMQ no está disponible — solo registra el
 * error. Devuelve el `eventId` generado (incluso si la publicación falló) para que el llamador
 * pueda, por ejemplo, correlacionarlo con un registro de "trabajo" propio.
 */
export async function publishEvent<T>(rabbitUrl: string, eventType: string, payload: T): Promise<string> {
  const event: DomainEvent<T> = {
    eventId: randomUUID(),
    eventType,
    occurredAt: new Date().toISOString(),
    payload,
  };
  try {
    const ch = await getChannel(rabbitUrl);
    ch.publish(EXCHANGE, eventType, Buffer.from(JSON.stringify(event)), {
      contentType: "application/json",
      persistent: true,
    });
  } catch (err) {
    console.error(`[events] no se pudo publicar "${eventType}"`, err);
  }
  return event.eventId;
}

export interface ConsumeOptions {
  /** Intentos totales (incluido el primero) antes de mover el mensaje a la DLQ. Default: 3. */
  maxAttempts?: number;
  /** Retardo base en ms antes de reintentar; crece linealmente con el número de intento. Default: 3000. */
  retryDelayMs?: number;
  /** Se invoca cuando un mensaje agota los reintentos y se mueve a la DLQ. Nunca debe lanzar. */
  onExhausted?: (event: DomainEvent<unknown>, error: unknown) => Promise<void>;
}

/**
 * Suscribe una cola durable a uno o más routing keys del exchange compartido, con reintentos
 * con backoff y dead-letter queue — ver comentario de cabecera del archivo. El `handler` recibe
 * también el número de intento actual (1 = primera entrega).
 */
export async function consumeEvents<T = unknown>(
  rabbitUrl: string,
  queueName: string,
  routingKeys: string[],
  handler: (event: DomainEvent<T>, meta: { attempt: number }) => Promise<void>,
  options: ConsumeOptions = {},
): Promise<void> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const retryQueue = `${queueName}.retry`;
  const dlq = `${queueName}.dlq`;

  const ch = await getChannel(rabbitUrl);
  await ch.assertQueue(queueName, { durable: true });
  await ch.assertQueue(dlq, { durable: true });
  // Cola de reintento: cada mensaje que cae aquí espera su TTL (por mensaje, vía `expiration`)
  // y, al expirar, RabbitMQ lo reenvía automáticamente a `queueName` (exchange por defecto +
  // routing key = nombre de la cola = entrega directa a esa cola).
  await ch.assertQueue(retryQueue, {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": "",
      "x-dead-letter-routing-key": queueName,
    },
  });
  for (const routingKey of routingKeys) {
    await ch.bindQueue(queueName, EXCHANGE, routingKey);
  }

  await ch.consume(queueName, (msg) => {
    if (!msg) return;
    const attempt = Number(msg.properties.headers?.["x-attempt"] ?? 0) + 1;
    Promise.resolve()
      .then(() => JSON.parse(msg.content.toString()) as DomainEvent<T>)
      .then((event) => handler(event, { attempt }).then(() => event))
      .then((event) => {
        ch.ack(msg);
        return event;
      })
      .catch(async (err) => {
        console.error(`[events] intento ${attempt}/${maxAttempts} falló para "${queueName}"`, err);
        const headers = { ...msg.properties.headers, "x-attempt": attempt, "x-error": String((err as Error)?.message ?? err) };
        if (attempt < maxAttempts) {
          ch.sendToQueue(retryQueue, msg.content, {
            persistent: true,
            expiration: String(retryDelayMs * attempt),
            headers,
          });
        } else {
          ch.sendToQueue(dlq, msg.content, { persistent: true, headers });
          if (options.onExhausted) {
            try {
              const event = JSON.parse(msg.content.toString()) as DomainEvent<T>;
              await options.onExhausted(event, err);
            } catch (hookErr) {
              console.error(`[events] onExhausted también falló para "${queueName}"`, hookErr);
            }
          }
        }
        ch.ack(msg);
      });
  });
}
