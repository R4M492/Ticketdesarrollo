import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import { notificationsApi } from "../api/endpoints";
import { EmptyState, PageLoader, Pagination } from "../components/ui";
import { timeAgo } from "../utils/format";

export default function Notifications() {
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["notifications", page],
    queryFn: () => notificationsApi.list({ page, pageSize: 15 }),
  });

  const markAll = async () => {
    await notificationsApi.markAllRead();
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["notifications-unread"] });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
            <Bell className="h-5 w-5 text-brand-600" /> Notificaciones
          </h1>
          <p className="text-sm text-slate-500">Todas las novedades de tus tickets</p>
        </div>
        <button className="btn-secondary" onClick={markAll}>
          <CheckCheck className="h-4 w-4" /> Marcar todas leídas
        </button>
      </div>

      {list.isLoading ? (
        <PageLoader />
      ) : list.data!.data.length === 0 ? (
        <div className="card">
          <EmptyState title="Sin notificaciones" description="Cuando haya novedades en tus tickets, aparecerán aquí" />
        </div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {list.data!.data.map((n) => (
            <button
              key={n.id}
              className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 ${!n.isRead ? "bg-brand-50/50" : ""}`}
              onClick={async () => {
                if (!n.isRead) {
                  await notificationsApi.markRead(n.id);
                  qc.invalidateQueries({ queryKey: ["notifications"] });
                  qc.invalidateQueries({ queryKey: ["notifications-unread"] });
                }
                if (n.ticketId) navigate(`/tickets/${n.ticketId}`);
              }}
            >
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${n.isRead ? "bg-slate-200" : "bg-brand-500"}`} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-700">{n.title}</p>
                <p className="mt-0.5 text-sm text-slate-500">{n.message}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {timeAgo(n.createdAt)}
                  {n.ticket && <span className="ml-2 font-mono text-brand-600">{n.ticket.ticketNumber}</span>}
                </p>
              </div>
            </button>
          ))}
          <Pagination page={list.data!.page} pageSize={list.data!.pageSize} total={list.data!.total} onChange={setPage} />
        </div>
      )}
    </div>
  );
}
