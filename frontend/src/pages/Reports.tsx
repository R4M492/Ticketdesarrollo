import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Users, Timer, Building2 } from "lucide-react";
import { reportsApi } from "../api/endpoints";
import { apiError } from "../api/client";
import { ErrorAlert, PageLoader, PriorityBadge, SlaBadge } from "../components/ui";
import { fmtDate, fmtMinutes } from "../utils/format";

type Tab = "tickets" | "productividad" | "sla" | "empresas";

export default function Reports() {
  const [tab, setTab] = useState<Tab>("tickets");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [exporting, setExporting] = useState(false);

  const tickets = useQuery({ queryKey: ["report-tickets"], queryFn: () => reportsApi.tickets() });
  const productivity = useQuery({ queryKey: ["report-productivity", month], queryFn: () => reportsApi.productivity({ month }) });
  const sla = useQuery({ queryKey: ["report-sla"], queryFn: () => reportsApi.sla() });
  const companies = useQuery({ queryKey: ["report-companies"], queryFn: () => reportsApi.companies() });

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "tickets", label: "Tickets", icon: <FileText className="h-4 w-4" /> },
    { id: "productividad", label: "Productividad", icon: <Users className="h-4 w-4" /> },
    { id: "sla", label: "SLA", icon: <Timer className="h-4 w-4" /> },
    { id: "empresas", label: "Empresas", icon: <Building2 className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Reportes</h1>
          <p className="text-sm text-slate-500">Estadísticas y productividad del soporte técnico</p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              await reportsApi.exportCsv({ month: month || undefined });
            } catch (err) {
              alert(apiError(err, "No se pudo exportar el CSV"));
            } finally {
              setExporting(false);
            }
          }}
        >
          <Download className="h-4 w-4" /> {exporting ? "Exportando..." : "Exportar CSV"}
        </button>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg bg-slate-200/60 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === t.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
            onClick={() => setTab(t.id)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tickets */}
      {tab === "tickets" &&
        (tickets.isLoading ? (
          <PageLoader />
        ) : tickets.isError ? (
          <ErrorAlert message="No se pudo cargar el reporte" onRetry={() => tickets.refetch()} />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard label="Total de tickets" value={tickets.data!.total} />
              <StatCard label="SLA cumplidos" value={tickets.data!.sla.ok} />
              <StatCard label="SLA incumplidos" value={tickets.data!.sla.breached} />
              <StatCard label="Cumplimiento" value={`${tickets.data!.total ? Math.round((tickets.data!.sla.ok / (tickets.data!.sla.ok + tickets.data!.sla.breached || 1)) * 100) : 100}%`} />
            </div>
            <div className="card overflow-x-auto">
              <table className="table-base min-w-[900px]">
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Asunto</th>
                    <th>Empresa</th>
                    <th>Prioridad</th>
                    <th>Técnico</th>
                    <th>Estado</th>
                    <th>Creado</th>
                    <th>SLA</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.data!.rows.map((t: { ticketNumber: string; subject: string; company: { name?: string } | null; priority: { color: string; name: string }; assignedTechnician: { name: string } | null; status: { color: string; name: string }; createdAt: string; sla: string }) => (
                    <tr key={t.ticketNumber}>
                      <td className="font-mono text-xs font-semibold text-brand-700">{t.ticketNumber}</td>
                      <td className="max-w-60 truncate text-slate-600">{t.subject}</td>
                      <td className="text-sm text-slate-500">{t.company?.name ?? "—"}</td>
                      <td><PriorityBadge color={t.priority.color} name={t.priority.name} /></td>
                      <td className="text-sm text-slate-600">{t.assignedTechnician?.name ?? "—"}</td>
                      <td><span className="badge" style={{ backgroundColor: `${t.status.color}1a`, color: t.status.color }}>{t.status.name}</span></td>
                      <td className="text-xs text-slate-500">{fmtDate(t.createdAt)}</td>
                      <td><SlaBadge sla={t.sla as never} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

      {/* Productividad */}
      {tab === "productividad" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <label className="label !mb-0">Mes:</label>
            <input type="month" className="input !w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          {productivity.isLoading ? (
            <PageLoader />
            ) : (
            <div className="card overflow-x-auto">
              <table className="table-base min-w-[700px]">
                <thead>
                  <tr>
                    <th>Técnico</th>
                    <th>Empresa</th>
                    <th>Total asignados</th>
                    <th>Resueltos</th>
                    <th>Cerrados</th>
                    <th>Abiertos</th>
                    <th>Prom. resolución</th>
                  </tr>
                </thead>
                <tbody>
                  {productivity.data!.map((t: { technician: string; company: string | null; total: number; resolved: number; closed: number; open: number; avgResolutionMinutes: number }) => (
                    <tr key={t.technician}>
                      <td className="font-medium text-slate-700">{t.technician}</td>
                      <td className="text-sm text-slate-500">{t.company ?? "—"}</td>
                      <td className="text-slate-600">{t.total}</td>
                      <td className="text-emerald-600">{t.resolved}</td>
                      <td className="text-slate-600">{t.closed}</td>
                      <td className="text-amber-600">{t.open}</td>
                      <td className="text-slate-600">{fmtMinutes(t.avgResolutionMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SLA */}
      {tab === "sla" && (
        <div className="card overflow-x-auto">
          {sla.isLoading ? (
            <PageLoader />
          ) : (
            <table className="table-base min-w-[700px]">
              <thead>
                <tr>
                  <th>Prioridad</th>
                  <th>Configuración SLA</th>
                  <th>Total</th>
                  <th>Cumplidos</th>
                  <th>Incumplidos</th>
                  <th>Pendientes</th>
                  <th>Cumplimiento</th>
                </tr>
              </thead>
              <tbody>
                {sla.data!.map((p: { priority: string; color: string; slaConfig: { responseMinutes: number; resolutionHours: number } | null; total: number; ok: number; breached: number; pending: number; compliancePct: number }) => (
                  <tr key={p.priority}>
                    <td><PriorityBadge color={p.color} name={p.priority} /></td>
                    <td className="text-sm text-slate-500">
                      {p.slaConfig ? `${p.slaConfig.responseMinutes} min / ${p.slaConfig.resolutionHours} h` : "Sin configurar"}
                    </td>
                    <td className="text-slate-600">{p.total}</td>
                    <td className="text-emerald-600">{p.ok}</td>
                    <td className="text-red-600">{p.breached}</td>
                    <td className="text-slate-500">{p.pending}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full bg-emerald-500" style={{ width: `${p.compliancePct}%` }} />
                        </div>
                        <span className="text-sm text-slate-600">{p.compliancePct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Empresas */}
      {tab === "empresas" && (
        <div className="card overflow-x-auto">
          {companies.isLoading ? (
            <PageLoader />
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Total</th>
                  <th>Abiertos</th>
                  <th>Resueltos/Cerrados</th>
                </tr>
              </thead>
              <tbody>
                {companies.data!.map((c: { company: string; total: number; open: number; resolved: number }) => (
                  <tr key={c.company}>
                    <td className="font-medium text-slate-700">{c.company}</td>
                    <td className="text-slate-600">{c.total}</td>
                    <td className="text-amber-600">{c.open}</td>
                    <td className="text-emerald-600">{c.resolved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-4">
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
