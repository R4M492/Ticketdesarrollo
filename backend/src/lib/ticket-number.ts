import type { PrismaClient } from "@prisma/client";

/**
 * Genera el siguiente número de ticket: TKT-2026-000001
 * Usa MAX() sobre ticketNumber para evitar race conditions en PostgreSQL.
 * En PostgreSQL, startsWith se traduce a LIKE 'TKT-2026-%' que usa el índice.
 */
export async function generateTicketNumber(prisma: PrismaClient): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `TKT-${year}-`;
  const last = await prisma.ticket.findFirst({
    where: { ticketNumber: { startsWith: prefix } },
    orderBy: { ticketNumber: "desc" },
    select: { ticketNumber: true },
  });
  let seq = 1;
  if (last) {
    const parts = last.ticketNumber.split("-");
    seq = parseInt(parts[parts.length - 1], 10) + 1;
  }
  return `${prefix}${String(seq).padStart(6, "0")}`;
}
