import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Admin123!";

async function main() {
  console.log("🌱 Iniciando seed...");

  // ---------- Roles ----------
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

  // ---------- Estados de ticket ----------
  const statuses = [
    { code: "NUEVO", name: "Nuevo", color: "#3b82f6", sortOrder: 1, isClosed: false, description: "Ticket recién creado" },
    { code: "PENDIENTE_ASIGNACION", name: "Pendiente de asignación", color: "#8b5cf6", sortOrder: 2, isClosed: false, description: "En espera de asignación de técnico" },
    { code: "ASIGNADO", name: "Asignado", color: "#06b6d4", sortOrder: 3, isClosed: false, description: "Asignado a un técnico" },
    { code: "EN_PROCESO", name: "En proceso", color: "#f59e0b", sortOrder: 4, isClosed: false, description: "El técnico está trabajando" },
    { code: "ESPERA_USUARIO", name: "En espera de usuario", color: "#eab308", sortOrder: 5, isClosed: false, description: "Se requiere información del usuario" },
    { code: "RESUELTO", name: "Resuelto", color: "#10b981", sortOrder: 6, isClosed: false, description: "Solución aplicada, esperando confirmación" },
    { code: "CERRADO", name: "Cerrado", color: "#64748b", sortOrder: 7, isClosed: true, description: "Confirmado y cerrado" },
    { code: "REABIERTO", name: "Reabierto", color: "#ef4444", sortOrder: 8, isClosed: false, description: "El problema continúa; requiere nueva atención" },
    { code: "CANCELADO", name: "Cancelado", color: "#94a3b8", sortOrder: 9, isClosed: true, description: "Cancelado por el solicitante o el MASTER" },
  ];
  const statusMap: Record<string, number> = {};
  for (const s of statuses) {
    const created = await prisma.ticketStatus.upsert({
      where: { code: s.code },
      update: s,
      create: s,
    });
    statusMap[s.code] = created.id;
  }

  // ---------- Prioridades + SLA ----------
  const priorities = [
    { code: "CRITICA", name: "Crítica", color: "#dc2626", sortOrder: 1, description: "Interrupción total de un servicio crítico", sla: { responseMinutes: 15, resolutionHours: 4 } },
    { code: "ALTA", name: "Alta", color: "#f97316", sortOrder: 2, description: "Problema que afecta significativamente las operaciones", sla: { responseMinutes: 30, resolutionHours: 8 } },
    { code: "MEDIA", name: "Media", color: "#eab308", sortOrder: 3, description: "Problema que afecta parcialmente al usuario", sla: { responseMinutes: 240, resolutionHours: 24 } },
    { code: "BAJA", name: "Baja", color: "#22c55e", sortOrder: 4, description: "Solicitud o problema de bajo impacto", sla: { responseMinutes: 480, resolutionHours: 72 } },
  ];
  const priorityMap: Record<string, number> = {};
  for (const p of priorities) {
    const { sla, ...priorityData } = p;
    const created = await prisma.ticketPriority.upsert({
      where: { code: p.code },
      update: priorityData,
      create: priorityData,
    });
    priorityMap[p.code] = created.id;
    await prisma.slaConfiguration.upsert({
      where: { priorityId: created.id },
      update: { responseMinutes: sla.responseMinutes, resolutionHours: sla.resolutionHours, active: true },
      create: { priorityId: created.id, responseMinutes: sla.responseMinutes, resolutionHours: sla.resolutionHours },
    });
  }

  // ---------- Categorías + subcategorías ----------
  const categories: { name: string; subcategories: string[] }[] = [
    { name: "Hardware", subcategories: ["Computadora de escritorio", "Laptop", "Monitor", "Teclado / Mouse", "Celular / Tablet"] },
    { name: "Software", subcategories: ["Instalación", "Licencias", "Actualización", "Configuración"] },
    { name: "Red", subcategories: ["Sin conexión", "Lentitud", "Wi-Fi", "VPN", "Cableado"] },
    { name: "Impresoras", subcategories: ["No imprime", "Atascos de papel", "Instalación / Drivers", "Tóner / Tinta"] },
    { name: "Sistemas", subcategories: ["Sistema de nómina", "Sistema de facturación", "Sistema de inventarios", "Otros sistemas"] },
    { name: "SAP", subcategories: ["Módulo FI", "Módulo CO", "Módulo MM", "Módulo SD", "Errores de acceso"] },
    { name: "Correo electrónico", subcategories: ["No recibe correos", "No envía correos", "Configuración de cuenta", "Buzón lleno"] },
    { name: "Accesos", subcategories: ["Cambio de contraseña", "Desbloqueo de cuenta", "Nuevo acceso", "Permisos de red"] },
    { name: "Seguridad", subcategories: ["Antivirus", "Virus / Malware", "Phishing", "Auditoría de accesos"] },
    { name: "Telefonía", subcategories: ["Anexo / Extensión", "Llamadas entrantes", "Llamadas salientes", "Mensajes de voz"] },
    { name: "Otros", subcategories: ["Solicitud general", "Duda / Asesoría"] },
  ];
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    const created = await prisma.ticketCategory.upsert({
      where: { name: cat.name },
      update: { sortOrder: i + 1, status: "ACTIVE" },
      create: { name: cat.name, sortOrder: i + 1 },
    });
    for (let j = 0; j < cat.subcategories.length; j++) {
      await prisma.ticketSubcategory.upsert({
        where: { categoryId_name: { categoryId: created.id, name: cat.subcategories[j] } },
        update: { sortOrder: j + 1, status: "ACTIVE" },
        create: { categoryId: created.id, name: cat.subcategories[j], sortOrder: j + 1 },
      });
    }
  }

  // ---------- Empresa + departamentos ----------
  const company = await prisma.company.upsert({
    where: { name: "Empresa Demo S.A." },
    update: {},
    create: { name: "Empresa Demo S.A.", description: "Empresa de demostración" },
  });
  const departments = ["Tecnologías de la Información", "Recursos Humanos", "Finanzas", "Ventas", "Producción", "Logística"];
  const deptMap: Record<string, number> = {};
  for (const d of departments) {
    const created = await prisma.department.upsert({
      where: { companyId_name: { companyId: company.id, name: d } },
      update: {},
      create: { companyId: company.id, name: d },
    });
    deptMap[d] = created.id;
  }

  // ---------- Usuarios demo ----------
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 8);
  const techPasswordHash = await bcrypt.hash("Tecnico123!", 8);
  const userPasswordHash = await bcrypt.hash("Usuario123!", 8);

  const master = await prisma.user.upsert({
    where: { email: "jefe.soporte@empresa.com" },
    update: { passwordHash, roleId: roleMap.MASTER, status: "ACTIVE" },
    create: {
      name: "Jefe de Soporte",
      email: "jefe.soporte@empresa.com",
      passwordHash,
      roleId: roleMap.MASTER,
      phone: "555-0001",
      position: "Jefe de Soporte Técnico",
      companyId: company.id,
      departmentId: deptMap["Tecnologías de la Información"],
    },
  });

  const tech1 = await prisma.user.upsert({
    where: { email: "carlos.tec@empresa.com" },
    update: { passwordHash: techPasswordHash, roleId: roleMap.TECNICO, status: "ACTIVE" },
    create: {
      name: "Carlos Técnico",
      email: "carlos.tec@empresa.com",
      passwordHash: techPasswordHash,
      roleId: roleMap.TECNICO,
      phone: "555-0002",
      position: "Técnico de Soporte",
      companyId: company.id,
      departmentId: deptMap["Tecnologías de la Información"],
    },
  });

  const tech2 = await prisma.user.upsert({
    where: { email: "ana.tec@empresa.com" },
    update: { passwordHash: techPasswordHash, roleId: roleMap.TECNICO, status: "ACTIVE" },
    create: {
      name: "Ana Técnica",
      email: "ana.tec@empresa.com",
      passwordHash: techPasswordHash,
      roleId: roleMap.TECNICO,
      phone: "555-0003",
      position: "Técnica de Soporte",
      companyId: company.id,
      departmentId: deptMap["Tecnologías de la Información"],
    },
  });

  const user1 = await prisma.user.upsert({
    where: { email: "maria.usuario@empresa.com" },
    update: { passwordHash: userPasswordHash, roleId: roleMap.USUARIO, status: "ACTIVE" },
    create: {
      name: "María Usuaria",
      email: "maria.usuario@empresa.com",
      passwordHash: userPasswordHash,
      roleId: roleMap.USUARIO,
      phone: "555-0004",
      position: "Analista de Finanzas",
      companyId: company.id,
      departmentId: deptMap["Finanzas"],
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: "pedro.usuario@empresa.com" },
    update: { passwordHash: userPasswordHash, roleId: roleMap.USUARIO, status: "ACTIVE" },
    create: {
      name: "Pedro Usuario",
      email: "pedro.usuario@empresa.com",
      passwordHash: userPasswordHash,
      roleId: roleMap.USUARIO,
      phone: "555-0005",
      position: "Supervisor de Ventas",
      companyId: company.id,
      departmentId: deptMap["Ventas"],
    },
  });

  console.log("✅ Seed completado");
  console.log("──────────────────────────────────────────────");
  console.log(`  MASTER : jefe.soporte@empresa.com  / ${ADMIN_PASSWORD}`);
  console.log(`  TECNICO: carlos.tec@empresa.com    / Tecnico123!`);
  console.log(`  TECNICO: ana.tec@empresa.com       / Tecnico123!`);
  console.log(`  USUARIO: maria.usuario@empresa.com / Usuario123!`);
  console.log(`  USUARIO: pedro.usuario@empresa.com / Usuario123!`);
  console.log("──────────────────────────────────────────────");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
