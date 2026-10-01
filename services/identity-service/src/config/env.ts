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
  PORT: Number(process.env.PORT ?? 4001),
  DATABASE_URL: required("DATABASE_URL"),
  JWT_SECRET: required("JWT_SECRET"),
  RABBITMQ_URL: required("RABBITMQ_URL"),
  ORGANIZATION_SERVICE_URL: process.env.ORGANIZATION_SERVICE_URL ?? "http://organization-service:4002",
  ACCESS_TOKEN_MINUTES: Number(process.env.ACCESS_TOKEN_MINUTES ?? 30),
  REFRESH_TOKEN_DAYS: Number(process.env.REFRESH_TOKEN_DAYS ?? 7),
  REMEMBER_REFRESH_TOKEN_DAYS: Number(process.env.REMEMBER_REFRESH_TOKEN_DAYS ?? 30),
} as const;
