import type { NextFunction, Request, Response } from "express";

/** Restringe la ruta a los roles indicados (requiere authenticate antes). */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "No autenticado" });
    }
    if (!roles.includes(req.user.role.code)) {
      return res.status(403).json({ error: "No tienes permisos para realizar esta acción" });
    }
    next();
  };
}
