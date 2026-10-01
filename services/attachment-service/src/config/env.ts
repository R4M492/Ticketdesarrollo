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
  PORT: Number(process.env.PORT ?? 4005),
  JWT_SECRET: required("JWT_SECRET"),
  MONGO_URI: required("MONGO_URI"),
  MONGO_DB_NAME: process.env.MONGO_DB_NAME ?? "attachment_db",
  RABBITMQ_URL: required("RABBITMQ_URL"),
  TICKETING_SERVICE_URL: process.env.TICKETING_SERVICE_URL ?? "http://ticketing-service:4004",
  UPLOAD_DIR: process.env.UPLOAD_DIR ?? "uploads",
  UPLOAD_MAX_MB: Number(process.env.UPLOAD_MAX_MB ?? 10),
} as const;
