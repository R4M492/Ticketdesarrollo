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
  PORT: Number(process.env.PORT ?? 4008),
  JWT_SECRET: required("JWT_SECRET"),
  TICKETING_SERVICE_URL: process.env.TICKETING_SERVICE_URL ?? "http://ticketing-service:4004",
  CATALOG_SERVICE_URL: process.env.CATALOG_SERVICE_URL ?? "http://catalog-service:4003",
  ORGANIZATION_SERVICE_URL: process.env.ORGANIZATION_SERVICE_URL ?? "http://organization-service:4002",
  IDENTITY_SERVICE_URL: process.env.IDENTITY_SERVICE_URL ?? "http://identity-service:4001",
} as const;
