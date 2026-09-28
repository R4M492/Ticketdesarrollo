import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Settings as SettingsIcon } from "lucide-react";
import { settingsApi } from "../api/endpoints";
import { apiError } from "../api/client";
import { ErrorAlert, PageLoader } from "../components/ui";

export default function Settings() {
  const qc = useQueryClient();
  const data = useQuery({ queryKey: ["settings"], queryFn: settingsApi.get });
  const [form, setForm] = useState({ systemName: "", businessName: "", uploadMaxMb: "10", notificationEmailEnabled: "false", slaWarningPercent: "80" });
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (data.data) {
      setForm({
        systemName: data.data.systemName ?? "",
        businessName: data.data.businessName ?? "",
        uploadMaxMb: data.data.uploadMaxMb ?? "10",
        notificationEmailEnabled: data.data.notificationEmailEnabled ?? "false",
        slaWarningPercent: data.data.slaWarningPercent ?? "80",
      });
    }
  }, [data.data]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      await settingsApi.update(form);
      setSuccess("Configuración guardada");
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (error) {
      setErr(apiError(error));
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
          <SettingsIcon className="h-5 w-5 text-brand-600" /> Configuración del sistema
        </h1>
        <p className="text-sm text-slate-500">Parámetros generales de la plataforma</p>
      </div>

      {data.isLoading ? (
        <PageLoader />
      ) : (
        <form onSubmit={save} className="card space-y-4 p-6">
          {err && <ErrorAlert message={err} />}
          {success && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700">{success}</div>}

          <div>
            <label className="label">Nombre del sistema</label>
            <input className="input" value={form.systemName} onChange={(e) => setForm({ ...form, systemName: e.target.value })} />
          </div>
          <div>
            <label className="label">Nombre de la empresa</label>
            <input className="input" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tamaño máximo de archivos (MB)</label>
              <input type="number" className="input" min={1} max={100} value={form.uploadMaxMb} onChange={(e) => setForm({ ...form, uploadMaxMb: e.target.value })} />
            </div>
            <div>
              <label className="label">Umbral de alerta SLA (%)</label>
              <input type="number" className="input" min={1} max={99} value={form.slaWarningPercent} onChange={(e) => setForm({ ...form, slaWarningPercent: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Notificaciones por correo (fase posterior)</label>
            <select className="input" value={form.notificationEmailEnabled} onChange={(e) => setForm({ ...form, notificationEmailEnabled: e.target.value })}>
              <option value="false">Deshabilitadas (solo notificaciones internas)</option>
              <option value="true">Habilitadas</option>
            </select>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="btn-primary">
              <Save className="h-4 w-4" /> Guardar configuración
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
