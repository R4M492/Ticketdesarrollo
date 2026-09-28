import { useEffect, type ReactNode } from "react";
import { X, Inbox, AlertTriangle, CheckCircle2, Clock, Ban } from "lucide-react";
import type { SlaIndicator } from "../types";

// ---------- Badges ----------

export function Badge({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="badge" style={{ backgroundColor: `${color}1a`, color }}>
      {children}
    </span>
  );
}

export function StatusBadge({ color, children }: { color: string; children: ReactNode }) {
  return <Badge color={color || "#64748b"}>{children}</Badge>;
}

export function PriorityBadge({ color, name }: { color: string; name: string }) {
  return (
    <span className="badge" style={{ backgroundColor: `${color}1a`, color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}

export function SlaBadge({ sla }: { sla: SlaIndicator }) {
  if (sla === "normal") {
    return (
      <span className="badge bg-green-50 text-green-700">
        <CheckCircle2 className="h-3 w-3" /> SLA OK
      </span>
    );
  }
  if (sla === "proximo") {
    return (
      <span className="badge bg-amber-50 text-amber-700">
        <Clock className="h-3 w-3" /> Próximo a vencer
      </span>
    );
  }
  if (sla === "vencido") {
    return (
      <span className="badge bg-red-50 text-red-700">
        <AlertTriangle className="h-3 w-3" /> Vencido
      </span>
    );
  }
  return <span className="badge bg-slate-100 text-slate-500">Sin SLA</span>;
}

// ---------- Modal ----------

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;
  const sizes = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className={`relative w-full ${sizes[size]} rounded-xl bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// ---------- Spinner / estados ----------

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-3 rounded-full bg-slate-100 p-4">
        <Inbox className="h-8 w-8 text-slate-400" />
      </div>
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
    </div>
  );
}

// ---------- Paginación ----------

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <p className="text-xs text-slate-500">
        Mostrando {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
      </p>
      <div className="flex gap-1">
        <button className="btn-secondary !px-3 !py-1.5 text-xs" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Anterior
        </button>
        <span className="px-2 py-1.5 text-xs text-slate-600">
          Página {page} de {totalPages}
        </span>
        <button
          className="btn-secondary !px-3 !py-1.5 text-xs"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

// ---------- Alerta de error ----------

export function ErrorAlert({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">{message}</div>
      {onRetry && (
        <button className="text-xs font-medium underline" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function CancelIcon() {
  return <Ban className="h-4 w-4" />;
}
