import { env } from "../config/env.js";

/**
 * Cliente HTTP hacia catalog-service. Catalog-service no expone GET de un solo recurso por id
 * (solo listados completos + subcategorías por categoría), así que aquí se trae la lista completa
 * y se busca localmente — las 3 listas son pequeñas (categorías, prioridades, estados) y cambian
 * poco, así que no vale la pena optimizar esto en esta fase (ver plan de migración, sección 4.3).
 */

export interface CatalogSubcategory {
  id: number;
  categoryId: number;
  name: string;
  status: string;
}

export interface CatalogCategory {
  id: number;
  name: string;
  status: string;
  subcategories: CatalogSubcategory[];
}

export interface CatalogSla {
  responseMinutes: number;
  resolutionHours: number;
  active: boolean;
}

export interface CatalogPriority {
  id: number;
  code: string;
  name: string;
  color: string;
  status: string;
  sla: CatalogSla | null;
}

export interface CatalogStatus {
  id: number;
  code: string;
  name: string;
  color: string;
  isClosed: boolean;
  status: string;
}

async function getJson<T>(url: string, authorization: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: authorization } });
  if (!res.ok) throw new Error(`${url} respondió ${res.status}`);
  return (await res.json()) as T;
}

export function getCategories(authorization: string): Promise<CatalogCategory[]> {
  return getJson(`${env.CATALOG_SERVICE_URL}/api/categories`, authorization);
}

export function getPriorities(authorization: string): Promise<CatalogPriority[]> {
  return getJson(`${env.CATALOG_SERVICE_URL}/api/priorities`, authorization);
}

export function getStatuses(authorization: string): Promise<CatalogStatus[]> {
  return getJson(`${env.CATALOG_SERVICE_URL}/api/statuses`, authorization);
}
