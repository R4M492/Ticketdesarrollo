import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Timer } from "lucide-react";
import { catalogApi } from "../../api/endpoints";
import { apiError } from "../../api/client";
import { ErrorAlert, Modal, PageLoader, PriorityBadge } from "../../components/ui";
import type { Priority } from "../../types";

export default function Priorities() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["priorities"], queryFn: catalogApi.priorities });
  const [prioOpen, setPrioOpen] = useState(false);
  const [slaOpen, setSlaOpen] = useState<Priority | null>(null);
  const [prioForm, setPrioForm] = useState({ name: "", code: "", description: "", color: "#f97316" });
  const [slaForm, setSlaForm] = useState({ responseMinutes: "30", resolutionHours: "8", active: true });
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");

  const savePrio = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await catalogApi.createPriority(prioForm);
      setSuccess("Prioridad creada");
      setPrioOpen(false);
      qc.invalidateQueries({ queryKey: ["priorities"] });
    } catch (error) {
      setErr(apiError(error));
    }
  };

  const saveSla = async (e: FormEvent) => {
    e.preventDefault();
    if (!slaOpen) return;
    try {
      await catalogApi.updateSla(slaOpen.id, {
        responseMinutes: Number(slaForm.responseMinutes),
        resolutionHours: Number(slaForm.resolutionHours),
        active: slaForm.active,
      });
      setSuccess(`SLA de "${slaOpen.name}" actualizado`);
      setSlaOpen(null);
      qc.invalidateQueries({ queryKey: ["priorities"] });
    } catch (error) {
      setErr(apiError(error));
    }
  };

  const openSla = (p: Priority) => {
    setSlaOpen(p);
    setSlaForm({
      responseMinutes: String(p.sla?.responseMinutes ?? 30),
      resolutionHours: String(p.sla?.resolutionHours ?? 8),
      active: p.sla?.active ?? true,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Prioridades y SLA</h1>
          <p className="text-sm text-slate-500">Catálogo de prioridades y tiempos de respuesta/objetivo</p>
        </div>
        <button className="btn-primary" onClick={() => { setPrioForm({ name: "", code: "", description: "", color: "#f97316" }); setPrioOpen(true); }}>
          <Plus className="h-4 w-4" /> Nueva prioridad
        </button>
      </div>

      {err && <ErrorAlert message={err} />}
      {success && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700">{success}</div>}

      {list.isLoading ? (
        <PageLoader />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Prioridad</th>
                <th>Descripción</th>
                <th>Tiempo de respuesta</th>
                <th>Tiempo objetivo</th>
                <th>SLA</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.data!.map((p) => (
                <tr key={p.id}>
                  <td><PriorityBadge color={p.color} name={p.name} /></td>
                  <td className="max-w-xs text-sm text-slate-500">{p.description ?? "—"}</td>
                  <td className="text-sm text-slate-600">{p.sla ? `${p.sla.responseMinutes} min` : "—"}</td>
                  <td className="text-sm text-slate-600">{p.sla ? `${p.sla.resolutionHours} h` : "—"}</td>
                  <td>
                    <span className={`badge ${p.sla?.active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                      {p.sla?.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <button className="btn-ghost !p-2" onClick={() => openSla(p)}>
                        <Timer className="h-4 w-4" /> <span className="text-xs">SLA</span>
                      </button>
                      <button className="btn-ghost !p-2"><Pencil className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={prioOpen} onClose={() => setPrioOpen(false)} title="Nueva prioridad">
        <form onSubmit={savePrio} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nombre *</label>
              <input className="input" required minLength={2} value={prioForm.name} onChange={(e) => setPrioForm({ ...prioForm, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Código *</label>
              <input className="input" required minLength={2} placeholder="ALTA" value={prioForm.code} onChange={(e) => setPrioForm({ ...prioForm, code: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea className="input" rows={2} value={prioForm.description} onChange={(e) => setPrioForm({ ...prioForm, description: e.target.value })} />
          </div>
          <div>
            <label className="label">Color</label>
            <input type="color" className="h-10 w-20 rounded border border-slate-300" value={prioForm.color} onChange={(e) => setPrioForm({ ...prioForm, color: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setPrioOpen(false)}>Cancelar</button>
            <button type="submit" className="btn-primary">Crear</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!slaOpen} onClose={() => setSlaOpen(null)} title={`SLA de ${slaOpen?.name ?? ""}`}>
        <form onSubmit={saveSla} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tiempo de respuesta (minutos) *</label>
              <input type="number" className="input" required min={1} value={slaForm.responseMinutes} onChange={(e) => setSlaForm({ ...slaForm, responseMinutes: e.target.value })} />
            </div>
            <div>
              <label className="label">Tiempo objetivo (horas) *</label>
              <input type="number" className="input" required min={1} value={slaForm.resolutionHours} onChange={(e) => setSlaForm({ ...slaForm, resolutionHours: e.target.value })} />
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={slaForm.active} onChange={(e) => setSlaForm({ ...slaForm, active: e.target.checked })} />
            SLA activo para nuevos tickets
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setSlaOpen(null)}>Cancelar</button>
            <button type="submit" className="btn-primary">Guardar SLA</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
