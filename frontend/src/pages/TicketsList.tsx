import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Download, PlusCircle, Filter, X } from "lucide-react";
import { ticketsApi, catalogApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { EmptyState, ErrorAlert, PageLoader, Pagination, PriorityBadge, SlaBadge, StatusBadge } from "../components/ui";
import { fmtDate, timeAgo } from "../utils/format";
import type { Ticket } from "../types";

export default function TicketsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const page = Number(params.get("page") ?? 1);
  const statusCode = params.get("statusCode") ?? undefined;
  const sla = params.get("sla") ?? undefined;

  const filters = {
    page,
    pageSize: 10,
    search: params.get("search") ?? undefined,
    statusCode,
    sla,
    priorityId: params.get("priorityId") ? Number(params.get("priorityId")) : undefined,
    categoryId: params.get("categoryId") ? Number(params.get("categoryId")) : undefined,
    technicianId: params.get("technicianId") ? Number(params.get("technicianId")) : undefined,
    companyId: params.get("companyId") ? Number(params.get("companyId")) : undefined,
  };

  const tickets = useQuery({ queryKey: ["tickets", filters], queryFn: () => ticketsApi.list(filters) });
  const statuses = useQuery({ queryKey: ["statuses"], queryFn: catalogApi.statuses });
  const priorities = useQuery({ queryKey: ["priorities"], queryFn: catalogApi.priorities });
  const categories = useQuery({ queryKey: ["categories"], queryFn: catalogApi.categories });
  const companies = useQuery({ queryKey: ["companies"], queryFn: catalogApi.companies });

  useEffect(() => {
    setSearch(params.get("search") ?? "");
  }, [params]);

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next, { replace: true });
  };

  const applySearch = () => setParam("search", search.trim() || undefined);

  const activeStatusLabel =
    statusCode === "PENDIENTE_ASIGNACION"
      ? "Pendientes de asignación"
      : statuses.data?.find((s) => s.code === statusCode)?.name ?? undefined;

  const title = user?.role.code === "TECNICO" ? "Mis tickets" : user?.role.code === "MASTER" ? "Todos los tickets" : "Mis tickets";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{title}</h1>
          <p className="text-sm text-slate-500">
            {activeStatusLabel ? `Filtro: ${activeStatusLabel}` : "Busca, filtra y da seguimiento a los tickets"}
          </p>
        </div>
        <div className="flex gap-2">
          {user?.role.code === "MASTER" && (
            <a
              href={`/api/tickets/export?${params.toString()}`}
              className="btn-secondary"
              onClick={(e) => {
                e.preventDefault();
                window.open(`/api/tickets/export?${params.toString()}`, "_blank");
              }}
            >
              <Download className="h-4 w-4" /> Exportar CSV
            </a>
          )}
          <Link to="/tickets/new" className="btn-primary">
            <PlusCircle className="h-4 w-4" /> Nuevo ticket
          </Link>
        </div>
      </div>

      {/* Búsqueda y filtros */}
      <div className="card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input !pl-9"
              placeholder="Buscar por número, asunto, solicitante, equipo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applySearch()}
            />
          </div>
          <button className="btn-secondary" onClick={() => setFiltersOpen((v) => !v)}>
            <Filter className="h-4 w-4" /> Filtros
            {(statusCode || params.get("priorityId") || params.get("categoryId") || params.get("companyId")) && (
              <span className="ml-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {(statusCode ? 1 : 0) + (params.get("priorityId") ? 1 : 0) + (params.get("categoryId") ? 1 : 0) + (params.get("companyId") ? 1 : 0)}
              </span>
            )}
          </button>
        </div>

        {filtersOpen && (
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 md:grid-cols-4">
            <div>
              <label className="label">Estado</label>
              <select className="input" value={statusCode ?? ""} onChange={(e) => setParam("statusCode", e.target.value || undefined)}>
                <option value="">Todos</option>
                {statuses.data?.map((s) => (
                  <option key={s.id} value={s.code}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Prioridad</label>
              <select className="input" value={params.get("priorityId") ?? ""} onChange={(e) => setParam("priorityId", e.target.value || undefined)}>
                <option value="">Todas</option>
                {priorities.data?.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Categoría</label>
              <select className="input" value={params.get("categoryId") ?? ""} onChange={(e) => setParam("categoryId", e.target.value || undefined)}>
                <option value="">Todas</option>
                {categories.data?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            {user?.role.code === "MASTER" && (
              <div>
                <label className="label">Empresa</label>
                <select className="input" value={params.get("companyId") ?? ""} onChange={(e) => setParam("companyId", e.target.value || undefined)}>
                  <option value="">Todas</option>
                  {companies.data?.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabla */}
      {tickets.isLoading ? (
        <PageLoader />
      ) : tickets.isError ? (
        <ErrorAlert message="No se pudieron cargar los tickets" onRetry={() => tickets.refetch()} />
      ) : tickets.data!.data.length === 0 ? (
        <div className="card">
          <EmptyState title="No hay tickets" description="Crea un ticket nuevo o ajusta los filtros de búsqueda" />
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base min-w-[900px]">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Asunto</th>
                <th>Solicitante</th>
                <th>Prioridad</th>
                <th>Técnico</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>SLA</th>
              </tr>
            </thead>
            <tbody>
              {tickets.data!.data.map((t: Ticket) => (
                <tr key={t.id} className="cursor-pointer" onClick={() => navigate(`/tickets/${t.id}`)}>
                  <td className="font-mono text-xs font-semibold text-brand-700">{t.ticketNumber}</td>
                  <td className="max-w-60">
                    <p className="truncate font-medium text-slate-700">{t.subject}</p>
                    <p className="text-xs text-slate-400">{t.category.name}{t.subcategory ? ` · ${t.subcategory.name}` : ""}</p>
                  </td>
                  <td>
                    <p className="text-sm text-slate-600">{t.requesterName}</p>
                    <p className="text-xs text-slate-400">{t.company?.name}</p>
                  </td>
                  <td><PriorityBadge color={t.priority.color} name={t.priority.name} /></td>
                  <td className="text-sm text-slate-600">{t.assignedTechnician?.name ?? <span className="text-slate-400">—</span>}</td>
                  <td><StatusBadge color={t.status.color}>{t.status.name}</StatusBadge></td>
                  <td>
                    <p className="text-xs text-slate-500">{fmtDate(t.createdAt)}</p>
                    <p className="text-[10px] text-slate-400">{timeAgo(t.createdAt)}</p>
                  </td>
                  <td><SlaBadge sla={t.sla} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={tickets.data!.page} pageSize={tickets.data!.pageSize} total={tickets.data!.total} onChange={(p) => setParam("page", String(p))} />
        </div>
      )}
    </div>
  );
}
