import { useQuery } from "@tanstack/react-query";
import { catalogApi } from "../api/endpoints";

/**
 * Arquitectura de microservicios (Fase 2/6): identity-service ya no devuelve `company`/`department`
 * anidados dentro de un User — solo `companyId`/`departmentId` sueltos (esos datos viven en
 * organization-service). Este hook trae los catálogos completos de empresas/departamentos (listas
 * pequeñas, ya cacheadas por React Query) y da helpers para resolver el nombre por id, en vez de
 * esperar que el backend los anide.
 */
export function useOrgDirectory() {
  const companies = useQuery({ queryKey: ["companies"], queryFn: catalogApi.companies });
  const departments = useQuery({ queryKey: ["departments-all"], queryFn: () => catalogApi.departments() });

  const companyName = (companyId?: number | null): string | undefined =>
    companyId ? companies.data?.find((c) => c.id === companyId)?.name : undefined;

  const departmentName = (departmentId?: number | null): string | undefined =>
    departmentId ? departments.data?.find((d) => d.id === departmentId)?.name : undefined;

  return { companyName, departmentName, isLoading: companies.isLoading || departments.isLoading };
}
