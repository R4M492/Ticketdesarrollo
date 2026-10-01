import { PrismaClient } from "@prisma/client";

// Adaptado desde backend/prisma/seed.ts: solo la parte de empresa + departamentos.

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 organization-service: iniciando seed...");

  const company = await prisma.company.upsert({
    where: { name: "Empresa Demo S.A." },
    update: {},
    create: { name: "Empresa Demo S.A.", description: "Empresa de demostración" },
  });

  const departments = ["Tecnologías de la Información", "Recursos Humanos", "Finanzas", "Ventas", "Producción", "Logística"];
  for (const d of departments) {
    await prisma.department.upsert({
      where: { companyId_name: { companyId: company.id, name: d } },
      update: {},
      create: { companyId: company.id, name: d },
    });
  }

  console.log("✅ organization-service: seed completado");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
