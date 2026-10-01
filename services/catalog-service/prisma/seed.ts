import { PrismaClient } from "@prisma/client";

// Adaptado desde backend/prisma/seed.ts: solo la parte de estados, prioridades+SLA y
// categorías+subcategorías (lo que pertenece a catalog-service).

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 catalog-service: iniciando seed...");

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
  for (const s of statuses) {
    await prisma.ticketStatus.upsert({ where: { code: s.code }, update: s, create: s });
  }

  const priorities = [
    { code: "CRITICA", name: "Crítica", color: "#dc2626", sortOrder: 1, description: "Interrupción total de un servicio crítico", sla: { responseMinutes: 15, resolutionHours: 4 } },
    { code: "ALTA", name: "Alta", color: "#f97316", sortOrder: 2, description: "Problema que afecta significativamente las operaciones", sla: { responseMinutes: 30, resolutionHours: 8 } },
    { code: "MEDIA", name: "Media", color: "#eab308", sortOrder: 3, description: "Problema que afecta parcialmente al usuario", sla: { responseMinutes: 240, resolutionHours: 24 } },
    { code: "BAJA", name: "Baja", color: "#22c55e", sortOrder: 4, description: "Solicitud o problema de bajo impacto", sla: { responseMinutes: 480, resolutionHours: 72 } },
  ];
  for (const p of priorities) {
    const { sla, ...priorityData } = p;
    const created = await prisma.ticketPriority.upsert({
      where: { code: p.code },
      update: priorityData,
      create: priorityData,
    });
    await prisma.slaConfiguration.upsert({
      where: { priorityId: created.id },
      update: { responseMinutes: sla.responseMinutes, resolutionHours: sla.resolutionHours, active: true },
      create: { priorityId: created.id, responseMinutes: sla.responseMinutes, resolutionHours: sla.resolutionHours },
    });
  }

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

  console.log("✅ catalog-service: seed completado");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
