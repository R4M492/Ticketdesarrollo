import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { HttpError } from "./http-error.js";

/**
 * Payload de acceso usado en toda la arquitectura de microservicios.
 *
 * Adaptación deliberada respecto al monolito original: `middleware/auth.ts` del monolito
 * solo firmaba `{ sub: userId }` y cada request hacía un `prisma.user.findUnique(...)` para
 * cargar el rol/empresa/depto completos desde la BD. Eso ya no es posible aquí: solo
 * identity-service tiene acceso a la base de usuarios (regla de "una BD por servicio").
 * Por eso el token ahora embebe `role` al firmarlo (ver services/identity-service), y el
 * resto de los servicios validan la firma sin volver a consultar ninguna base de datos.
 *
 * `name` se agregó en la Fase 8: el monolito original usaba `req.user.name` en decenas de
 * lugares de tickets/routes.ts (historial, notificaciones, auditoría) sin volver a consultar la
 * BD. Reconsultar identity-service en cada acción de ticket solo para el nombre habría sido
 * carísimo; embeberlo en el JWT (como cualquier "display name" de un token) es el balance
 * correcto aquí. Puede quedar desactualizado hasta el siguiente login si el usuario cambia su
 * nombre — aceptable para este sistema.
 */
export interface AccessTokenPayload {
  sub: number;
  role: string;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export function signAccessToken(payload: AccessTokenPayload, secret: string, expiresInMinutes: number): string {
  return jwt.sign(payload, secret, { expiresIn: `${expiresInMinutes}m` });
}

/** Verifica el JWT (firma + expiración) y adjunta { sub, role } a req.user. No consulta ninguna base de datos. */
export function authenticate(secret: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return next(new HttpError(401, "No autenticado"));
    }
    const token = header.slice(7);
    try {
      const payload = jwt.verify(token, secret) as unknown as AccessTokenPayload;
      req.user = payload;
      next();
    } catch {
      next(new HttpError(401, "Sesión inválida o expirada"));
    }
  };
}
