import type { NextFunction, Request, Response } from "express";
import { HttpError } from "./http-error.js";

/** Requiere que req.user.role sea uno de los roles permitidos (ya cargado por `authenticate`). */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new HttpError(401, "No autenticado"));
    }
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, "No tienes permiso para realizar esta acción"));
    }
    next();
  };
}
