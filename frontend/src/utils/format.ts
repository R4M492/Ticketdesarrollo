import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export function fmtDate(value?: string | Date | null): string {
  if (!value) return "—";
  return format(new Date(value), "dd/MM/yyyy HH:mm", { locale: es });
}

export function fmtDateShort(value?: string | Date | null): string {
  if (!value) return "—";
  return format(new Date(value), "dd/MM/yyyy", { locale: es });
}

export function timeAgo(value?: string | Date | null): string {
  if (!value) return "—";
  return formatDistanceToNow(new Date(value), { addSuffix: true, locale: es });
}

export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fmtMinutes(minutes?: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const STATUS_LABELS: Record<string, string> = {
  NUEVO: "Nuevo",
  PENDIENTE_ASIGNACION: "Pendiente de asignación",
  ASIGNADO: "Asignado",
  EN_PROCESO: "En proceso",
  ESPERA_USUARIO: "En espera de usuario",
  RESUELTO: "Resuelto",
  CERRADO: "Cerrado",
  REABIERTO: "Reabierto",
  CANCELADO: "Cancelado",
};

export function statusLabel(code: string): string {
  return STATUS_LABELS[code] ?? code;
}
