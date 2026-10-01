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
  PORT: Number(process.env.PORT ?? 4004),
  DATABASE_URL: required("DATABASE_URL"),
  JWT_SECRET: required("JWT_SECRET"),
  RABBITMQ_URL: required("RABBITMQ_URL"),
  IDENTITY_SERVICE_URL: process.env.IDENTITY_SERVICE_URL ?? "http://identity-service:4001",
  CATALOG_SERVICE_URL: process.env.CATALOG_SERVICE_URL ?? "http://catalog-service:4003",
  ORGANIZATION_SERVICE_URL: process.env.ORGANIZATION_SERVICE_URL ?? "http://organization-service:4002",
} as const;
