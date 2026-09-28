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
  PORT: Number(process.env.PORT ?? 3001),
  DATABASE_URL: required("DATABASE_URL"),
  JWT_SECRET: required("JWT_SECRET"),
  JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET"),
  ACCESS_TOKEN_MINUTES: Number(process.env.ACCESS_TOKEN_MINUTES ?? 30),
  REFRESH_TOKEN_DAYS: Number(process.env.REFRESH_TOKEN_DAYS ?? 7),
  REMEMBER_REFRESH_TOKEN_DAYS: Number(process.env.REMEMBER_REFRESH_TOKEN_DAYS ?? 30),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  UPLOAD_MAX_MB: Number(process.env.UPLOAD_MAX_MB ?? 10),
  UPLOAD_DIR: process.env.UPLOAD_DIR ?? "uploads",
} as const;

export const isProd = env.NODE_ENV === "production";
