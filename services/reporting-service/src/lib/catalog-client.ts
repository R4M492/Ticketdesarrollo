import { env } from "../config/env.js";

export interface CatalogStatus {
  id: number;
  code: string;
  name: string;
  color: string;
  sortOrder: number;
  status: string;
}

export interface CatalogPriority {
  id: number;
  code: string;
  name: string;
  color: string;
  sortOrder: number;
  sla: { responseMinutes: number; resolutionHours: number } | null;
}

export interface CatalogCategory {
  id: number;
  name: string;
  sortOrder: number;
  status: string;
}

async function getJson<T>(url: string, authorization: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: authorization } });
  if (!res.ok) throw new Error(`${url} respondió ${res.status}`);
  return (await res.json()) as T;
}

export function getStatuses(authorization: string): Promise<CatalogStatus[]> {
  return getJson(`${env.CATALOG_SERVICE_URL}/api/statuses`, authorization);
}

export function getPriorities(authorization: string): Promise<CatalogPriority[]> {
  return getJson(`${env.CATALOG_SERVICE_URL}/api/priorities`, authorization);
}

export function getCategories(authorization: string): Promise<CatalogCategory[]> {
  return getJson(`${env.CATALOG_SERVICE_URL}/api/categories`, authorization);
}
