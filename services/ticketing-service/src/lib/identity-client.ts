import { env } from "../config/env.js";

/**
 * Cliente HTTP hacia identity-service. Reenvía el Authorization Bearer del request original —
 * mismo JWT_SECRET compartido, ver packages/common/src/auth.ts. Sustituye los `prisma.user.*`
 * que el monolito hacía directo contra la misma base (ver plan de migración, sección 4.3).
 */

export interface MeProfile {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  companyId: number | null;
  departmentId: number | null;
}

export interface UserLookup {
  id: number;
  name: string;
  email: string;
  roleCode: string;
  status: string;
}

/** El propio perfil del usuario autenticado (necesita el token del propio usuario, no de otro). */
export async function getMe(authorization: string): Promise<MeProfile> {
  const res = await fetch(`${env.IDENTITY_SERVICE_URL}/api/auth/me`, {
    headers: { Authorization: authorization },
  });
  if (!res.ok) throw new Error(`identity-service /auth/me respondió ${res.status}`);
  return (await res.json()) as MeProfile;
}

/** Resuelve varios usuarios en lote (nombre/correo/rol/estado) — para enriquecer o validar. */
export async function lookupUsers(ids: number[], authorization: string): Promise<UserLookup[]> {
  if (ids.length === 0) return [];
  const unique = [...new Set(ids)];
  const res = await fetch(`${env.IDENTITY_SERVICE_URL}/api/users/lookup?ids=${unique.join(",")}`, {
    headers: { Authorization: authorization },
  });
  if (!res.ok) return [];
  return (await res.json()) as UserLookup[];
}

/** Un solo usuario (conveniencia sobre lookupUsers). */
export async function lookupUser(id: number, authorization: string): Promise<UserLookup | null> {
  const [user] = await lookupUsers([id], authorization);
  return user ?? null;
}

/** IDs+nombres de todos los usuarios activos de un rol — usado por notifyRole (ver lib/notifications.ts). */
export async function getUsersByRole(roleCode: string, authorization: string): Promise<{ id: number; name: string }[]> {
  const res = await fetch(`${env.IDENTITY_SERVICE_URL}/api/users/by-role/${roleCode}`, {
    headers: { Authorization: authorization },
  });
  if (!res.ok) return [];
  return (await res.json()) as { id: number; name: string }[];
}
