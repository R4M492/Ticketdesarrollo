import { env } from "../config/env.js";

export interface TechnicianUser {
  id: number;
  name: string;
  companyId: number | null;
  status: string;
}

/**
 * Lista de técnicos vía identity-service. A diferencia de ticketing-service (Fase 8), aquí no hace
 * falta el endpoint sin-MASTER (`/users/by-role`): quien llama a estos reportes/dashboard YA es
 * MASTER (`requireRole(ROLES.MASTER)` o el chequeo inline en by-technician), así que el mismo
 * token forwarded pasa sin problema el guard de `GET /api/users` en identity-service.
 */
export async function getTechnicians(authorization: string): Promise<TechnicianUser[]> {
  const res = await fetch(`${env.IDENTITY_SERVICE_URL}/api/users?roleCode=TECNICO&pageSize=100`, {
    headers: { Authorization: authorization },
  });
  if (!res.ok) throw new Error(`identity-service /api/users respondió ${res.status}`);
  const body = (await res.json()) as { data: TechnicianUser[] };
  return body.data;
}
