import dotenv from "dotenv";

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Falta la variable de entorno: ${name}`);
  }
  return value;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 4006),
  JWT_SECRET: required("JWT_SECRET"),
  MONGO_URI: required("MONGO_URI"),
  MONGO_DB_NAME: process.env.MONGO_DB_NAME ?? "notification_db",
  RABBITMQ_URL: required("RABBITMQ_URL"),
  // SMTP real (Gmail): SMTP_USER es la cuenta de Gmail completa, SMTP_PASS es una "contraseña de
  // aplicación" de 16 caracteres (requiere verificación en 2 pasos activada en la cuenta de Google,
  // se genera en myaccount.google.com/apppasswords) — NUNCA la contraseña normal de la cuenta.
  // Si no se configuran, el consumidor de email.send no envía nada y solo lo deja registrado en log.
  SMTP_USER: process.env.SMTP_USER || null,
  SMTP_PASS: process.env.SMTP_PASS || null,
  SMTP_FROM: process.env.SMTP_FROM || process.env.SMTP_USER || null,
  // Mantiene el fallo simulado (para demostrar reintentos/DLQ) incluso con SMTP real configurado.
  // Poner en "false" para que el envío real nunca falle a propósito.
  SIMULATE_FAILURES: (process.env.SIMULATE_FAILURES ?? "true") === "true",
} as const;
