import { env } from "../config/env.js";

export interface OrgCompany {
  id: number;
  name: string;
  status: string;
}

export interface OrgDepartment {
  id: number;
  companyId: number;
  name: string;
  status: string;
}

async function getJson<T>(url: string, authorization: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: authorization } });
  if (!res.ok) throw new Error(`${url} respondió ${res.status}`);
  return (await res.json()) as T;
}

export function getCompanies(authorization: string): Promise<OrgCompany[]> {
  return getJson(`${env.ORGANIZATION_SERVICE_URL}/api/companies`, authorization);
}

export function getDepartments(authorization: string): Promise<OrgDepartment[]> {
  return getJson(`${env.ORGANIZATION_SERVICE_URL}/api/departments`, authorization);
}
