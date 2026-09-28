import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  // Connection pooling: mantiene conexiones vivas para no abrir/cerrar en cada petición
  datasources: {
    db: {
      // Pool de conexiones para PostgreSQL (no aplica a SQLite)
      // interval: Tiempo en ms entre ciclos del pool
    },
  },
  log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
});
