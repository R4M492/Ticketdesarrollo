import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { isProd } from "../config/env.js";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function notFound(req: Request, res: Response) {
  res.status(404).json({ error: "Ruta no encontrada" });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = (err.meta?.target as string[]) ?? [];
      return res.status(409).json({ error: `Ya existe un registro con ese valor (${target.join(", ")})` });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Registro no encontrado" });
    }
  }

  if (err instanceof SyntaxError && "status" in err && (err as { status?: number }).status === 400) {
    return res.status(400).json({ error: "JSON inválido en la petición" });
  }

  console.error("[error]", err);
  return res.status(500).json({ error: isProd ? "Error interno del servidor" : String(err) });
}
