import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Adaptado desde backend/prisma/seed.ts: solo la parte de Role + User (lo único que pertenece a
// identity-service). companyId/departmentId están hardcodeados asumiendo que
// services/organization-service/prisma/seed.ts ya corrió sobre una base nueva (siempre crea
// "Empresa Demo S.A." como primera fila → id 1, y los mismos 6 departamentos en el mismo orden
// → ids 1-6) — ambos seeds son deterministas sobre una base vacía, así que no hay condición de
// carrera real entre los dos contenedores, aunque arranquen en cualquier orden. Antes de la
// Fase 6 estos campos quedaban en null porque organization-service no existía.

const prisma = new PrismaClient();

const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Admin123!";

const COMPANY_ID = 1; // Empresa Demo S.A.
const DEPT_TI = 1; // Tecnologías de la Información
const DEPT_FINANZAS = 3;
const DEPT_VENTAS = 4;

async function main() {
  console.log("🌱 identity-service: iniciando seed...");

  const roles = [
    { code: "MASTER", name: "Jefe de Soporte", description: "Control administrativo completo" },
    { code: "TECNICO", name: "Técnico / Agente", description: "Atiende los tickets asignados" },
    { code: "USUARIO", name: "Usuario / Solicitante", description: "Reporta incidentes y da seguimiento" },
  ];
  const roleMap: Record<string, number> = {};
  for (const r of roles) {
    const created = await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name, description: r.description },
      create: r,
    });
    roleMap[r.code] = created.id;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 8);
  const techPasswordHash = await bcrypt.hash("Tecnico123!", 8);
  const userPasswordHash = await bcrypt.hash("Usuario123!", 8);

  await prisma.user.upsert({
    where: { email: "jefe.soporte@empresa.com" },
    update: { passwordHash, roleId: roleMap.MASTER, status: "ACTIVE", companyId: COMPANY_ID, departmentId: DEPT_TI },
    create: {
      name: "Jefe de Soporte",
      email: "jefe.soporte@empresa.com",
      passwordHash,
      roleId: roleMap.MASTER,
      phone: "555-0001",
      position: "Jefe de Soporte Técnico",
      companyId: COMPANY_ID,
      departmentId: DEPT_TI,
    },
  });

  await prisma.user.upsert({
    where: { email: "carlos.tec@empresa.com" },
    update: { passwordHash: techPasswordHash, roleId: roleMap.TECNICO, status: "ACTIVE", companyId: COMPANY_ID, departmentId: DEPT_TI },
    create: {
      name: "Carlos Técnico",
      email: "carlos.tec@empresa.com",
      passwordHash: techPasswordHash,
      roleId: roleMap.TECNICO,
      phone: "555-0002",
      position: "Técnico de Soporte",
      companyId: COMPANY_ID,
      departmentId: DEPT_TI,
    },
  });

  await prisma.user.upsert({
    where: { email: "ana.tec@empresa.com" },
    update: { passwordHash: techPasswordHash, roleId: roleMap.TECNICO, status: "ACTIVE", companyId: COMPANY_ID, departmentId: DEPT_TI },
    create: {
      name: "Ana Técnica",
      email: "ana.tec@empresa.com",
      passwordHash: techPasswordHash,
      roleId: roleMap.TECNICO,
      phone: "555-0003",
      position: "Técnica de Soporte",
      companyId: COMPANY_ID,
      departmentId: DEPT_TI,
    },
  });

  await prisma.user.upsert({
    where: { email: "maria.usuario@empresa.com" },
    update: { passwordHash: userPasswordHash, roleId: roleMap.USUARIO, status: "ACTIVE", companyId: COMPANY_ID, departmentId: DEPT_FINANZAS },
    create: {
      name: "María Usuaria",
      email: "maria.usuario@empresa.com",
      passwordHash: userPasswordHash,
      roleId: roleMap.USUARIO,
      phone: "555-0004",
      position: "Analista de Finanzas",
      companyId: COMPANY_ID,
      departmentId: DEPT_FINANZAS,
    },
  });

  await prisma.user.upsert({
    where: { email: "pedro.usuario@empresa.com" },
    update: { passwordHash: userPasswordHash, roleId: roleMap.USUARIO, status: "ACTIVE", companyId: COMPANY_ID, departmentId: DEPT_VENTAS },
    create: {
      name: "Pedro Usuario",
      email: "pedro.usuario@empresa.com",
      passwordHash: userPasswordHash,
      roleId: roleMap.USUARIO,
      phone: "555-0005",
      position: "Supervisor de Ventas",
      companyId: COMPANY_ID,
      departmentId: DEPT_VENTAS,
    },
  });

  console.log("✅ identity-service: seed completado");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
