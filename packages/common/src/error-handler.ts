import type { NextFunction, Request, Response } from "express";
import { HttpError } from "./http-error.js";

/**
 * Duck-typed check for a Prisma "known request error" (has a `.code` like "P2002").
 * No se importa `@prisma/client` aquí a propósito: este paquete lo usan también
 * servicios que no tienen Prisma (los respaldados por MongoDB), y `@prisma/client`
 * falla en tiempo de ejecución si no se corrió `prisma generate` en ese proyecto.
 */
function isPrismaKnownRequestError(err: unknown): err is { code: string; meta?: { target?: string[] } } {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    /^P\d{4}$/.test((err as { code: string }).code)
  );
}

/**
 * Duck-typed check para cualquier error que ya trae un `.status` HTTP numérico
 * asignado a mano (patrón usado en el monolito original, ej. tickets/helpers.ts),
 * sin necesariamente ser instancia de HttpError.
 */
function hasNumericStatus(err: unknown): err is { status: number; message?: string } {
  return typeof err === "object" && err !== null && "status" in err && typeof (err as { status: unknown }).status === "number";
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "Ruta no encontrada" });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  if (isPrismaKnownRequestError(err)) {
    if (err.code === "P2002") {
      const target = err.meta?.target ?? [];
      return res.status(409).json({ error: `Ya existe un registro con ese valor (${target.join(", ")})` });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Registro no encontrado" });
    }
    if (err.code === "P2003") {
      return res.status(409).json({ error: "No se puede completar la operación: hay registros que dependen de este" });
    }
  }

  if (err instanceof SyntaxError && "status" in err && (err as { status?: number }).status === 400) {
    return res.status(400).json({ error: "JSON inválido en la petición" });
  }

  if (hasNumericStatus(err)) {
    return res.status(err.status).json({ error: err.message ?? "Error" });
  }

  console.error("[error]", err);
  const isProd = process.env.NODE_ENV === "production";
  return res.status(500).json({ error: isProd ? "Error interno del servidor" : String(err) });
}
