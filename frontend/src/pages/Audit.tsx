import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Search } from "lucide-react";
import { auditApi } from "../api/endpoints";
import { EmptyState, PageLoader, Pagination } from "../components/ui";
import { fmtDate } from "../utils/format";

export default function Audit() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");

  const actions = useQuery({ queryKey: ["audit-actions"], queryFn: auditApi.actions });
  const list = useQuery({
    queryKey: ["audit", page, search, action],
    queryFn: () => auditApi.list({ page, pageSize: 20, search: search || undefined, action: action || undefined }),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
          <ShieldCheck className="h-5 w-5 text-brand-600" /> Auditoría
        </h1>
        <p className="text-sm text-slate-500">Registro de acciones importantes del sistema</p>
      </div>

      <div className="card flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input !pl-9"
            placeholder="Buscar en descripciones..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select className="input !w-auto" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
          <option value="">Todas las acciones</option>
          {actions.data?.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {list.isLoading ? (
        <PageLoader />
      ) : list.data!.data.length === 0 ? (
        <div className="card"><EmptyState title="Sin registros de auditoría" /></div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base min-w-[800px]">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Acción</th>
                <th>Entidad</th>
                <th>Descripción</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {list.data!.data.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap text-xs text-slate-500">{fmtDate(a.createdAt)}</td>
                  <td className="text-sm text-slate-600">{a.user?.name ?? <span className="text-slate-400">Sistema</span>}</td>
                  <td>
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{a.action}</code>
                  </td>
                  <td className="text-xs text-slate-500">{a.entityType}{a.entityId ? ` #${a.entityId}` : ""}</td>
                  <td className="max-w-md truncate text-sm text-slate-600">{a.description}</td>
                  <td className="font-mono text-xs text-slate-400">{a.ipAddress ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={list.data!.page} pageSize={list.data!.pageSize} total={list.data!.total} onChange={setPage} />
        </div>
      )}
    </div>
  );
}
