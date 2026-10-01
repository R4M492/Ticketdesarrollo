import type { Request, Response } from "express";

/** Handler estándar de /health, igual de forma en los 9 servicios para monitoreo/gateway. */
export function healthCheck(serviceName: string) {
  return (_req: Request, res: Response) => {
    res.json({ ok: true, service: serviceName, time: new Date().toISOString() });
  };
}
