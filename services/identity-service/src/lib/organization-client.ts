import { env } from "../config/env.js";

/**
 * Cliente HTTP hacia organization-service, usado solo para validar companyId/departmentId al
 * crear/editar un usuario (ver modules/users/routes.ts). Antes de la Fase 6 esta validación no
 * existía (organization-service no tenía rutas reales todavía).
 *
 * Se reenvía el mismo Authorization Bearer del request original — quien llega hasta aquí ya pasó
 * por `requireRole(MASTER)`, así que el token sigue siendo válido para el GET correspondiente en
 * organization-service (mismo JWT_SECRET compartido, ver packages/common/src/auth.ts). Es
 * "validación síncrona al escribir" tal como se definió en el plan de migración, sección 4.3,
 * opción 1 — simple y correcta para el tamaño actual del sistema; se puede evolucionar a una
 * copia local sincronizada por eventos si algún día la latencia importa.
 */

interface Department {
  id: number;
  companyId: number;
  name: string;
}

export async function companyExists(companyId: number, authorization: string): Promise<boolean> {
  const res = await fetch(`${env.ORGANIZATION_SERVICE_URL}/api/companies/${companyId}`, {
    headers: { Authorization: authorization },
  });
  return res.ok;
}

export async function getDepartment(departmentId: number, authorization: string): Promise<Department | null> {
  const res = await fetch(`${env.ORGANIZATION_SERVICE_URL}/api/departments/${departmentId}`, {
    headers: { Authorization: authorization },
  });
  if (!res.ok) return null;
  return (await res.json()) as Department;
}
