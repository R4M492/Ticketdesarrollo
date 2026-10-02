import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Paperclip,
  Send,
  UserPlus,
  RefreshCw,
  Play,
  PauseCircle,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Download,
  History,
  AlertTriangle,
  Mail,
  Loader2,
} from "lucide-react";
import { ticketsApi, usersApi, jobsApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { apiError } from "../api/client";
import { ErrorAlert, Modal, PageLoader, PriorityBadge, SlaBadge, StatusBadge } from "../components/ui";
import { fmtDate, fmtBytes, fmtMinutes, timeAgo } from "../utils/format";
import { useOrgDirectory } from "../hooks/useOrgDirectory";
import type { Job, TicketAttachment, TimelineItem } from "../types";

export default function TicketDetail() {
  const { id } = useParams();
  const ticketId = Number(id);
  const { user } = useAuth();
  const qc = useQueryClient();
  const { companyName } = useOrgDirectory();

  const ticket = useQuery({ queryKey: ["ticket", ticketId], queryFn: () => ticketsApi.get(ticketId) });
  const timeline = useQuery({ queryKey: ["ticket-history", ticketId], queryFn: () => ticketsApi.history(ticketId) });
  const technicians = useQuery({ queryKey: ["technicians"], queryFn: usersApi.technicians });
  // Trabajo asíncrono de confirmación por correo (ver notification-service/src/consumers/email-consumer.ts).
  // Se refresca solo mientras esté en curso — al llegar a un estado final (COMPLETED/FAILED) deja de pedir.
  const emailJob = useQuery({
    queryKey: ["ticket-email-job", ticketId],
    queryFn: () => jobsApi.listByTicket(ticketId),
    refetchInterval: (query) => {
      const latest = query.state.data?.[0];
      return latest && (latest.status === "PROCESSING" || latest.status === "RETRYING") ? 1500 : false;
    },
  });
  // Fase 7: attachment-service es dueño de los adjuntos — ya no vienen embebidos en el comentario
  // (ver backend/tickets/helpers.ts original vs. la nueva forma de TicketComment). Se traen aparte
  // y se agrupan por commentId para pintarlos en la línea de tiempo.
  const attachments = useQuery({ queryKey: ["ticket-attachments", ticketId], queryFn: () => ticketsApi.attachments(ticketId) });
  const attachmentsByCommentId = new Map<number, TicketAttachment[]>();
  for (const a of attachments.data ?? []) {
    if (a.commentId == null) continue;
    const list = attachmentsByCommentId.get(a.commentId) ?? [];
    list.push(a);
    attachmentsByCommentId.set(a.commentId, list);
  }

  // UI state
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form states
  const [assignTech, setAssignTech] = useState("");
  const [assignReason, setAssignReason] = useState("");
  const [resolveForm, setResolveForm] = useState({ problemIdentified: "", cause: "", solutionApplied: "", observations: "", timeUsedMinutes: "" });
  const [reopenReason, setReopenReason] = useState("");
  const [statusTarget, setStatusTarget] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ticket", ticketId] });
    qc.invalidateQueries({ queryKey: ["ticket-history", ticketId] });
    qc.invalidateQueries({ queryKey: ["ticket-attachments", ticketId] });
    qc.invalidateQueries({ queryKey: ["ticket-email-job", ticketId] });
    qc.invalidateQueries({ queryKey: ["tickets"] });
    qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
  };

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    setError("");
    setSuccess("");
    try {
      await fn();
      setSuccess(okMsg);
      invalidate();
    } catch (err) {
      setError(apiError(err));
    }
  };

  const commentMutation = useMutation({
    mutationFn: async () => {
      await ticketsApi.addComment(ticketId, comment, files);
    },
    onSuccess: () => {
      setComment("");
      setFiles([]);
      invalidate();
    },
  });

  if (ticket.isLoading) return <PageLoader />;
  if (ticket.isError || !ticket.data) return <ErrorAlert message="No se pudo cargar el ticket" onRetry={() => ticket.refetch()} />;

  const t = ticket.data;
  const role = user?.role.code;
  const isOwner = user?.id === t.userId;
  const isAssignedTech = user?.id === t.assignedTechnicianId;
  const isOpen = ["NUEVO", "PENDIENTE_ASIGNACION", "ASIGNADO", "EN_PROCESO", "ESPERA_USUARIO", "REABIERTO"].includes(t.status.code);
  const canComment = t.status.code !== "CANCELADO";

  const canAssign = role === "MASTER" && isOpen;
  const canResolve = role === "MASTER" || (role === "TECNICO" && isAssignedTech);
  const canResolveNow = canResolve && ["ASIGNADO", "EN_PROCESO", "ESPERA_USUARIO", "REABIERTO"].includes(t.status.code);
  const canConfirm = (role === "MASTER" || isOwner) && t.status.code === "RESUELTO";
  const canReopen = (role === "MASTER" || isOwner) && ["RESUELTO", "CERRADO"].includes(t.status.code);
  const canCancel = (role === "MASTER" || isOwner) && isOpen;
  const canChangeStatus = role === "MASTER" || (role === "TECNICO" && isAssignedTech && ["ASIGNADO", "EN_PROCESO", "ESPERA_USUARIO"].includes(t.status.code));
  const canResendConfirmation = role === "MASTER" || isOwner;

  const statusOptionsByCurrent: Record<string, { value: string; label: string }[]> = {
    ASIGNADO: [
      { value: "EN_PROCESO", label: "En proceso" },
      { value: "ESPERA_USUARIO", label: "En espera de usuario" },
    ],
    EN_PROCESO: [{ value: "ESPERA_USUARIO", label: "En espera de usuario" }],
    ESPERA_USUARIO: [{ value: "EN_PROCESO", label: "En proceso (retomar)" }],
    NUEVO: [
      { value: "PENDIENTE_ASIGNACION", label: "Pendiente de asignación" },
      { value: "EN_PROCESO", label: "En proceso" },
    ],
    PENDIENTE_ASIGNACION: [{ value: "EN_PROCESO", label: "En proceso" }],
    REABIERTO: [{ value: "EN_PROCESO", label: "En proceso (retomar)" }],
  };
  const technicianOptions = statusOptionsByCurrent[t.status.code] ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link to="/tickets" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Volver a tickets
      </Link>

      {error && <ErrorAlert message={error} />}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" /> {success}
        </div>
      )}

      {/* Encabezado */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-lg font-bold text-brand-700">{t.ticketNumber}</h1>
              <StatusBadge color={t.status.color}>{t.status.name}</StatusBadge>
              <PriorityBadge color={t.priority.color} name={t.priority.name} />
              <SlaBadge sla={t.sla} />
            </div>
            <h2 className="mt-1 text-base font-semibold text-slate-800">{t.subject}</h2>
            <p className="mt-1 text-xs text-slate-400">
              Creado {timeAgo(t.createdAt)} · {fmtDate(t.createdAt)}
              {t.reopenedCount > 0 && ` · Reabierto ${t.reopenedCount} vez(es)`}
            </p>
          </div>
          {/* Acciones */}
          <div className="flex flex-wrap gap-2">
            {canAssign && (
              <button className="btn-primary" onClick={() => setAssignOpen(true)}>
                <UserPlus className="h-4 w-4" /> {t.assignedTechnician ? "Reasignar" : "Asignar técnico"}
              </button>
            )}
            {canChangeStatus && (
              <button className="btn-secondary" onClick={() => setStatusOpen(true)}>
                <RefreshCw className="h-4 w-4" /> Cambiar estado
              </button>
            )}
            {role === "TECNICO" && isAssignedTech && t.status.code === "ASIGNADO" && (
              <button className="btn-secondary" onClick={() => run(() => ticketsApi.changeStatus(t.id, "EN_PROCESO"), "Ticket iniciado")}>
                <Play className="h-4 w-4" /> Iniciar atención
              </button>
            )}
            {role === "TECNICO" && isAssignedTech && t.status.code === "ESPERA_USUARIO" && (
              <button className="btn-secondary" onClick={() => run(() => ticketsApi.changeStatus(t.id, "EN_PROCESO"), "Ticket retomado")}>
                <Play className="h-4 w-4" /> Retomar
              </button>
            )}
            {canResolveNow && (
              <button className="btn-primary" onClick={() => setResolveOpen(true)}>
                <CheckCircle2 className="h-4 w-4" /> Marcar como resuelto
              </button>
            )}
            {canConfirm && (
              <button className="btn-primary" onClick={() => run(() => ticketsApi.confirm(t.id), "Solución confirmada, ticket cerrado")}>
                <CheckCircle2 className="h-4 w-4" /> Problema solucionado
              </button>
            )}
            {canConfirm && (
              <button className="btn-secondary" onClick={() => setReopenOpen(true)}>
                <RotateCcw className="h-4 w-4" /> El problema continúa
              </button>
            )}
            {canReopen && !canConfirm && (
              <button className="btn-secondary" onClick={() => setReopenOpen(true)}>
                <RotateCcw className="h-4 w-4" /> Solicitar reapertura
              </button>
            )}
            {canCancel && (
              <button className="btn-danger" onClick={() => run(() => ticketsApi.cancel(t.id), "Ticket cancelado")}>
                <XCircle className="h-4 w-4" /> Cancelar
              </button>
            )}
          </div>
        </div>

        {/* Datos del ticket */}
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-3 lg:grid-cols-4">
          <Field label="Solicitante" value={t.requesterName} />
          <Field label="Correo" value={t.requesterEmail} />
          <Field label="Empresa" value={t.company?.name} />
          <Field label="Departamento" value={t.department?.name} />
          <Field label="Categoría" value={t.category.name} />
          <Field label="Subcategoría" value={t.subcategory?.name} />
          <Field label="Técnico asignado" value={t.assignedTechnician?.name} />
          <Field label="Ubicación" value={t.location} />
          <Field label="Equipo / dispositivo" value={t.device} />
          <Field label="Inventario" value={t.inventoryNumber} />
          <Field label="Teléfono" value={t.requesterPhone} />
          <Field label="Primera respuesta" value={t.firstResponseAt ? fmtDate(t.firstResponseAt) : undefined} />
          {t.resolvedAt && <Field label="Resuelto" value={fmtDate(t.resolvedAt)} />}
          {t.closedAt && <Field label="Cerrado" value={fmtDate(t.closedAt)} />}
        </div>

        <div className="mt-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Descripción del problema</p>
          <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">{t.description}</p>
        </div>

        {/* Trabajo en cola: confirmación por correo */}
        {(emailJob.data && emailJob.data.length > 0) || canResendConfirmation ? (
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <Mail className="h-3 w-3" /> Confirmación por correo
              </p>
              {canResendConfirmation && (
                <button
                  type="button"
                  className="btn-ghost !px-2 !py-1 text-xs"
                  onClick={() => run(() => ticketsApi.resendConfirmation(ticketId), "Correo de confirmación reenviado — procesando...")}
                >
                  <RefreshCw className="h-3 w-3" /> Reenviar
                </button>
              )}
            </div>
            {emailJob.data && emailJob.data.length > 0 && <EmailJobBadge job={emailJob.data[0]} />}
          </div>
        ) : null}

        {/* Adjuntos generales del ticket (subidos al crearlo, sin comentario asociado) */}
        {(attachments.data ?? []).filter((a) => a.commentId == null).length > 0 && (
          <div className="mt-4">
            <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <Paperclip className="h-3 w-3" /> Adjuntos del ticket
            </p>
            <div className="flex flex-wrap gap-2">
              {(attachments.data ?? [])
                .filter((a) => a.commentId == null)
                .map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => ticketsApi.downloadAttachment(a.ticketId, a.id, a.originalName)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:border-brand-400 hover:text-brand-700"
                  >
                    <Download className="h-3 w-3" /> {a.originalName} ({fmtBytes(a.sizeBytes)})
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Línea de tiempo */}
      <div className="card p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <History className="h-4 w-4 text-brand-600" /> Línea de tiempo / Historial
        </h3>
        {timeline.isLoading ? (
          <PageLoader />
        ) : (
          <ol className="relative space-y-5 border-l-2 border-slate-200 pl-5">
            {timeline.data?.map((item) => (
              <TimelineRow
                key={item.id}
                item={item}
                attachments={item.kind === "comment" ? attachmentsByCommentId.get(Number(item.id.slice(2))) : undefined}
              />
            ))}
          </ol>
        )}
      </div>

      {/* Seguimiento */}
      <div className="card p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Send className="h-4 w-4 text-brand-600" /> Agregar seguimiento
        </h3>
        {!canComment ? (
          <p className="text-sm text-slate-400">Los tickets cancelados no aceptan comentarios.</p>
        ) : (
          <>
            <textarea
              className="input min-h-24 resize-y"
              placeholder="Escribe tu comentario, diagnóstico, actividad realizada, resultado..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                <Paperclip className="h-4 w-4" /> Adjuntar archivos
                <span className="text-xs text-slate-400">({files.length})</span>
                <input type="file" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
              </label>
              <button
                className="btn-primary"
                disabled={!comment.trim() || commentMutation.isPending}
                onClick={() => commentMutation.mutate()}
              >
                <Send className="h-4 w-4" />
                {commentMutation.isPending ? "Enviando..." : "Enviar comentario"}
              </button>
            </div>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="text-xs text-slate-500">📎 {f.name} ({fmtBytes(f.size)})</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* Modal asignar */}
      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title={t.assignedTechnician ? "Reasignar técnico" : "Asignar técnico"}>
        <form
          className="space-y-3"
          onSubmit={async (e: FormEvent) => {
            e.preventDefault();
            await run(
              () => (t.assignedTechnician ? ticketsApi.reassign(t.id, Number(assignTech), assignReason) : ticketsApi.assign(t.id, Number(assignTech), assignReason)),
              "Ticket asignado correctamente",
            );
            setAssignOpen(false);
            setAssignTech("");
            setAssignReason("");
          }}
        >
          <div>
            <label className="label">Técnico *</label>
            <select className="input" required value={assignTech} onChange={(e) => setAssignTech(e.target.value)}>
              <option value="">Selecciona un técnico...</option>
              {technicians.data?.map((tech) => (
                <option key={tech.id} value={tech.id}>{tech.name} ({companyName(tech.companyId) ?? "sin empresa"})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Motivo {t.assignedTechnician ? "(obligatorio en reasignación)" : "(opcional)"}</label>
            <textarea className="input" rows={3} value={assignReason} onChange={(e) => setAssignReason(e.target.value)} placeholder="Ej.: Mayor disponibilidad del técnico" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setAssignOpen(false)}>Cancelar</button>
            <button type="submit" className="btn-primary">Asignar</button>
          </div>
        </form>
      </Modal>

      {/* Modal resolver */}
      <Modal open={resolveOpen} onClose={() => setResolveOpen(false)} title="Registrar solución" size="lg">
        <form
          className="space-y-3"
          onSubmit={async (e: FormEvent) => {
            e.preventDefault();
            await run(
              () =>
                ticketsApi.resolve(t.id, {
                  problemIdentified: resolveForm.problemIdentified,
                  cause: resolveForm.cause || undefined,
                  solutionApplied: resolveForm.solutionApplied,
                  observations: resolveForm.observations || undefined,
                  timeUsedMinutes: resolveForm.timeUsedMinutes ? Number(resolveForm.timeUsedMinutes) : undefined,
                }),
              "Ticket marcado como resuelto",
            );
            setResolveOpen(false);
            setResolveForm({ problemIdentified: "", cause: "", solutionApplied: "", observations: "", timeUsedMinutes: "" });
          }}
        >
          <div>
            <label className="label">Problema identificado *</label>
            <input className="input" required value={resolveForm.problemIdentified} onChange={(e) => setResolveForm({ ...resolveForm, problemIdentified: e.target.value })} />
          </div>
          <div>
            <label className="label">Causa</label>
            <input className="input" value={resolveForm.cause} onChange={(e) => setResolveForm({ ...resolveForm, cause: e.target.value })} />
          </div>
          <div>
            <label className="label">Solución aplicada *</label>
            <textarea className="input" required rows={3} value={resolveForm.solutionApplied} onChange={(e) => setResolveForm({ ...resolveForm, solutionApplied: e.target.value })} />
          </div>
          <div>
            <label className="label">Observaciones</label>
            <textarea className="input" rows={2} value={resolveForm.observations} onChange={(e) => setResolveForm({ ...resolveForm, observations: e.target.value })} />
          </div>
          <div>
            <label className="label">Tiempo utilizado (minutos)</label>
            <input type="number" min={0} className="input" value={resolveForm.timeUsedMinutes} onChange={(e) => setResolveForm({ ...resolveForm, timeUsedMinutes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setResolveOpen(false)}>Cancelar</button>
            <button type="submit" className="btn-primary">Marcar como resuelto</button>
          </div>
        </form>
      </Modal>

      {/* Modal reabrir */}
      <Modal open={reopenOpen} onClose={() => setReopenOpen(false)} title="Reabrir ticket">
        <form
          className="space-y-3"
          onSubmit={async (e: FormEvent) => {
            e.preventDefault();
            await run(() => ticketsApi.reopen(t.id, reopenReason), "Ticket reabierto");
            setReopenOpen(false);
            setReopenReason("");
          }}
        >
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            El ticket volverá a la bandeja del Jefe de Soporte para su reasignación.
          </div>
          <div>
            <label className="label">Motivo de la reapertura *</label>
            <textarea className="input" required rows={3} minLength={5} value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder="Describe por qué el problema continúa..." />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setReopenOpen(false)}>Cancelar</button>
            <button type="submit" className="btn-primary">Reabrir ticket</button>
          </div>
        </form>
      </Modal>

      {/* Modal cambio de estado */}
      <Modal open={statusOpen} onClose={() => setStatusOpen(false)} title="Cambiar estado">
        <form
          className="space-y-3"
          onSubmit={async (e: FormEvent) => {
            e.preventDefault();
            await run(() => ticketsApi.changeStatus(t.id, statusTarget), "Estado actualizado");
            setStatusOpen(false);
            setStatusTarget("");
          }}
        >
          <div>
            <label className="label">Nuevo estado *</label>
            <select className="input" required value={statusTarget} onChange={(e) => setStatusTarget(e.target.value)}>
              <option value="">Selecciona...</option>
              {technicianOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setStatusOpen(false)}>Cancelar</button>
            <button type="submit" className="btn-primary">Guardar</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// Estado del trabajo asíncrono que simula el envío del correo de confirmación — demuestra
// reintentos con backoff y dead-letter queue (ver packages/common/src/events.ts y
// notification-service/src/consumers/email-consumer.ts).
function EmailJobBadge({ job }: { job: Job }) {
  if (job.status === "PROCESSING") {
    return (
      <span className="badge bg-slate-100 text-slate-600">
        <Loader2 className="h-3 w-3 animate-spin" /> Enviando…
      </span>
    );
  }
  if (job.status === "RETRYING") {
    return (
      <span className="badge bg-amber-50 text-amber-700">
        <RefreshCw className="h-3 w-3 animate-spin" /> Reintentando (intento {job.attempt} de {job.maxAttempts})
      </span>
    );
  }
  if (job.status === "COMPLETED") {
    return (
      <span className="badge bg-green-50 text-green-700">
        <CheckCircle2 className="h-3 w-3" /> Correo enviado
      </span>
    );
  }
  return (
    <span className="badge bg-red-50 text-red-700" title={job.lastError ?? undefined}>
      <XCircle className="h-3 w-3" /> Falló tras {job.maxAttempts} intentos{job.lastError ? `: ${job.lastError}` : ""}
    </span>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="truncate text-slate-700">{value ?? <span className="text-slate-400">—</span>}</p>
    </div>
  );
}

function TimelineRow({ item, attachments }: { item: TimelineItem; attachments?: TicketAttachment[] }) {
  const colorMap: Record<string, string> = {
    history: "bg-slate-200",
    comment: "bg-brand-500",
    assignment: "bg-cyan-500",
    solution: "bg-emerald-500",
  };
  const dot = colorMap[item.kind] ?? "bg-slate-300";
  return (
    <li className="relative">
      <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-2 ring-white ${dot}`} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700">{item.title}</p>
        <p className="text-xs text-slate-400">{fmtDate(item.createdAt)} · {timeAgo(item.createdAt)}</p>
      </div>
      {item.user && <p className="text-xs text-slate-500">por {item.user.name}</p>}
      {item.description && (
        <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{item.description}</p>
      )}
      {item.kind === "comment" && attachments && attachments.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => ticketsApi.downloadAttachment(a.ticketId, a.id, a.originalName)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:border-brand-400 hover:text-brand-700"
            >
              <Download className="h-3 w-3" /> {a.originalName} ({fmtBytes(a.sizeBytes)})
            </button>
          ))}
        </div>
      )}
      {item.kind === "solution" && item.meta?.timeUsedMinutes != null && (
        <p className="mt-1 text-xs text-slate-400">Tiempo utilizado: {fmtMinutes(item.meta.timeUsedMinutes)}</p>
      )}
    </li>
  );
}
