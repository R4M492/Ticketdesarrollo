import { env } from "../config/env.js";

export interface OrgCompany {
  id: number;
  name: string;
}

export async function getCompanies(authorization: string): Promise<OrgCompany[]> {
  const res = await fetch(`${env.ORGANIZATION_SERVICE_URL}/api/companies`, { headers: { Authorization: authorization } });
  if (!res.ok) throw new Error(`organization-service /api/companies respondió ${res.status}`);
  return (await res.json()) as OrgCompany[];
}
