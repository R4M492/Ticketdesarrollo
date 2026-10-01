import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Ticket as TicketIcon,
  PlusCircle,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Timer,
  TrendingUp,
  Users,
  FileText,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import { dashboardApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { PageLoader, ErrorAlert } from "../components/ui";
import { fmtMinutes } from "../utils/format";

export default function Dashboard() {
  const { user } = useAuth();
  const role = user?.role.code ?? "USUARIO";
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const gridColor = isDark ? "#334155" : "#e2e8f0";
  const axisColor = isDark ? "#94a3b8" : "#64748b";
  const cursorFill = isDark ? "rgba(148, 163, 184, 0.15)" : "rgba(148, 163, 184, 0.15)";
  const tooltipContentStyle = {
    backgroundColor: isDark ? "#1e293b" : "#ffffff",
    border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
    borderRadius: 8,
    fontSize: 12,
    color: isDark ? "#e2e8f0" : "#1e293b",
  };
  const tooltipLabelStyle = { color: isDark ? "#e2e8f0" : "#1e293b" };
  const tooltipItemStyle = { color: isDark ? "#e2e8f0" : "#1e293b" };

  const summary = useQuery({ queryKey: ["dashboard-summary", role], queryFn: dashboardApi.summary });
  const byStatus = useQuery({ queryKey: ["dashboard-by-status"], queryFn: dashboardApi.byStatus });
  const byPriority = useQuery({ queryKey: ["dashboard-by-priority"], queryFn: dashboardApi.byPriority });
  const byCategory = useQuery({ queryKey: ["dashboard-by-category"], queryFn: dashboardApi.byCategory });
  const perDay = useQuery({ queryKey: ["dashboard-per-day"], queryFn: dashboardApi.perDay });
  const avgRes = useQuery({ queryKey: ["dashboard-avg-resolution"], queryFn: dashboardApi.avgResolution });
  const byTech = useQuery({ queryKey: ["dashboard-by-technician"], queryFn: dashboardApi.byTechnician });

  if (summary.isLoading) return <PageLoader />;
  if (summary.isError) return <ErrorAlert message="No se pudo cargar el dashboard" onRetry={() => summary.refetch()} />;
  const s = summary.data!;

  const kpiCards: { label: string; value: number; icon: React.ReactNode; color: string; to?: string }[] =
    role === "MASTER"
      ? [
          { label: "Tickets totales", value: s.total, icon: <TicketIcon className="h-5 w-5" />, color: "bg-brand-50 text-brand-600", to: "/tickets" },
          { label: "Nuevos", value: s.nuevos, icon: <PlusCircle className="h-5 w-5" />, color: "bg-blue-50 text-blue-600", to: "/tickets?statusCode=NUEVO" },
          { label: "Pendientes de asignación", value: s.pendientes, icon: <Clock className="h-5 w-5" />, color: "bg-violet-50 text-violet-600", to: "/tickets?statusCode=PENDIENTE_ASIGNACION" },
          { label: "Asignados", value: s.asignados, icon: <Users className="h-5 w-5" />, color: "bg-cyan-50 text-cyan-600", to: "/tickets?statusCode=ASIGNADO" },
          { label: "En proceso", value: s.enProceso, icon: <Timer className="h-5 w-5" />, color: "bg-amber-50 text-amber-600", to: "/tickets?statusCode=EN_PROCESO" },
          { label: "En espera de usuario", value: s.espera, icon: <Clock className="h-5 w-5" />, color: "bg-yellow-50 text-yellow-600", to: "/tickets?statusCode=ESPERA_USUARIO" },
          { label: "Resueltos", value: s.resueltos, icon: <CheckCircle2 className="h-5 w-5" />, color: "bg-emerald-50 text-emerald-600", to: "/tickets?statusCode=RESUELTO" },
          { label: "Cerrados", value: s.cerrados, icon: <CheckCircle2 className="h-5 w-5" />, color: "bg-slate-100 text-slate-600", to: "/tickets?statusCode=CERRADO" },
          { label: "Reabiertos", value: s.reabiertos, icon: <RefreshCw className="h-5 w-5" />, color: "bg-red-50 text-red-600", to: "/tickets?statusCode=REABIERTO" },
          { label: "Vencidos (SLA)", value: s.vencidos, icon: <AlertTriangle className="h-5 w-5" />, color: "bg-red-100 text-red-700", to: "/tickets?sla=vencido" },
          { label: "Prom. resolución", value: Math.round(s.avgResolutionMinutes), icon: <Timer className="h-5 w-5" />, color: "bg-indigo-50 text-indigo-600" },
          { label: "Resueltos este mes", value: s.resolvedThisMonth, icon: <TrendingUp className="h-5 w-5" />, color: "bg-green-50 text-green-600" },
        ]
      : role === "TECNICO"
        ? [
            { label: "Mis tickets", value: s.total, icon: <TicketIcon className="h-5 w-5" />, color: "bg-brand-50 text-brand-600", to: "/tickets" },
            { label: "Nuevos asignados", value: s.asignados, icon: <Users className="h-5 w-5" />, color: "bg-cyan-50 text-cyan-600", to: "/tickets?statusCode=ASIGNADO" },
            { label: "En proceso", value: s.enProceso, icon: <Timer className="h-5 w-5" />, color: "bg-amber-50 text-amber-600", to: "/tickets?statusCode=EN_PROCESO" },
            { label: "En espera de usuario", value: s.espera, icon: <Clock className="h-5 w-5" />, color: "bg-yellow-50 text-yellow-600", to: "/tickets?statusCode=ESPERA_USUARIO" },
            { label: "Resueltos", value: s.resueltos, icon: <CheckCircle2 className="h-5 w-5" />, color: "bg-emerald-50 text-emerald-600", to: "/tickets?statusCode=RESUELTO" },
            { label: "Cerrados", value: s.cerrados, icon: <XCircle className="h-5 w-5" />, color: "bg-slate-100 text-slate-600", to: "/tickets?statusCode=CERRADO" },
            { label: "Vencidos (SLA)", value: s.vencidos, icon: <AlertTriangle className="h-5 w-5" />, color: "bg-red-100 text-red-700", to: "/tickets?sla=vencido" },
            { label: "Prom. resolución", value: Math.round(s.avgResolutionMinutes), icon: <Timer className="h-5 w-5" />, color: "bg-indigo-50 text-indigo-600" },
            { label: "Resueltos este mes", value: s.resolvedThisMonth, icon: <TrendingUp className="h-5 w-5" />, color: "bg-green-50 text-green-600" },
          ]
        : [
            { label: "Mis tickets", value: s.total, icon: <TicketIcon className="h-5 w-5" />, color: "bg-brand-50 text-brand-600", to: "/tickets" },
            { label: "Abiertos", value: s.nuevos + s.pendientes + s.asignados + s.enProceso + s.espera + s.reabiertos, icon: <Clock className="h-5 w-5" />, color: "bg-amber-50 text-amber-600", to: "/tickets" },
            { label: "En proceso", value: s.enProceso, icon: <Timer className="h-5 w-5" />, color: "bg-blue-50 text-blue-600", to: "/tickets?statusCode=EN_PROCESO" },
            { label: "Resueltos", value: s.resueltos, icon: <CheckCircle2 className="h-5 w-5" />, color: "bg-emerald-50 text-emerald-600", to: "/tickets?statusCode=RESUELTO" },
            { label: "Cerrados", value: s.cerrados, icon: <XCircle className="h-5 w-5" />, color: "bg-slate-100 text-slate-600", to: "/tickets?statusCode=CERRADO" },
          ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            {role === "MASTER" ? "Dashboard del Jefe de Soporte" : role === "TECNICO" ? "Mi panel de trabajo" : "Mis tickets"}
          </h1>
          <p className="text-sm text-slate-500">Hola, {user?.name.split(" ")[0]} — {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <Link to="/tickets/new" className="btn-primary">
          <PlusCircle className="h-4 w-4" /> Crear ticket
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {kpiCards.map((k) => (
          <Link
            key={k.label}
            to={k.to ?? "#"}
            className={`card flex flex-col gap-2 p-4 transition-shadow hover:shadow-md ${k.to ? "" : "pointer-events-none"}`}
          >
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${k.color}`}>{k.icon}</div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{k.value}</p>
              <p className="text-xs text-slate-500">{k.label}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Tickets por estado">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={byStatus.data ?? []} dataKey="value" nameKey="status" innerRadius={55} outerRadius={90} paddingAngle={2}>
                {(byStatus.data ?? []).map((d) => (
                  <Cell key={String(d.code)} fill={String(d.color || "#94a3b8")} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => [v, "tickets"]} contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Tickets por prioridad">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={byPriority.data ?? []} dataKey="value" nameKey="priority" innerRadius={55} outerRadius={90} paddingAngle={2}>
                {(byPriority.data ?? []).map((d) => (
                  <Cell key={String(d.code)} fill={String(d.color || "#94a3b8")} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => [v, "tickets"]} contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Tickets por categoría">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byCategory.data ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="category" tick={{ fontSize: 11, fill: axisColor }} interval={0} angle={-35} textAnchor="end" height={70} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: axisColor }} />
              <Tooltip formatter={(v: number) => [v, "tickets"]} cursor={{ fill: cursorFill }} contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
              <Bar dataKey="value" fill="#3f6aec" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {role === "MASTER" && (
          <ChartCard title="Tickets por técnico">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byTech.data ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="technician" tick={{ fontSize: 11, fill: axisColor }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: axisColor }} />
                <Tooltip formatter={(v: number) => [v, "tickets"]} cursor={{ fill: cursorFill }} contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                <Bar dataKey="value" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        <ChartCard title="Tickets creados por día (últimos 14 días)">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={perDay.data ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: axisColor }} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: axisColor }} />
              <Tooltip formatter={(v: number) => [v, "tickets"]} labelFormatter={(l: string) => `Día ${l}`} contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
              <Line type="monotone" dataKey="value" stroke="#3f6aec" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Tiempo promedio de resolución (min, mensual)">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={avgRes.data ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: axisColor }} />
              <YAxis tick={{ fontSize: 11, fill: axisColor }} />
              <Tooltip
                formatter={(v: number) => [`${Math.round(v)} min`, "promedio"]}
                labelFormatter={(l: string) => `Mes ${l}`}
                contentStyle={tooltipContentStyle}
                labelStyle={tooltipLabelStyle}
                itemStyle={tooltipItemStyle}
              />
              <Line type="monotone" dataKey="avgMinutes" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {role === "TECNICO" && (
        <div className="card p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <FileText className="h-4 w-4 text-brand-600" /> Mi productividad mensual
          </p>
          <p className="text-sm text-slate-500">
            Tickets resueltos este mes: <span className="font-bold text-slate-700">{s.resolvedThisMonth}</span> · Tiempo promedio de resolución:{" "}
            <span className="font-bold text-slate-700">{fmtMinutes(s.avgResolutionMinutes)}</span>
          </p>
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>
      {children}
    </div>
  );
}
