import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Paperclip, X, Send, User, Info } from "lucide-react";
import { catalogApi, ticketsApi } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { apiError } from "../api/client";
import { ErrorAlert } from "../components/ui";
import { fmtBytes } from "../utils/format";
import { useOrgDirectory } from "../hooks/useOrgDirectory";

export default function TicketCreate() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { companyName, departmentName } = useOrgDirectory();

  const categories = useQuery({ queryKey: ["categories"], queryFn: catalogApi.categories });
  const priorities = useQuery({ queryKey: ["priorities"], queryFn: catalogApi.priorities });

  const [subject, setSubject] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [priorityId, setPriorityId] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [device, setDevice] = useState("");
  const [inventoryNumber, setInventoryNumber] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedCategory = categories.data?.find((c) => String(c.id) === categoryId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const ticket = await ticketsApi.create(
        {
          subject,
          categoryId: Number(categoryId),
          priorityId: Number(priorityId),
          subcategoryId: subcategoryId ? Number(subcategoryId) : undefined,
          description,
          location: location || undefined,
          device: device || undefined,
          inventoryNumber: inventoryNumber || undefined,
        },
        files,
      );
      navigate(`/tickets/${ticket.id}`);
    } catch (err) {
      setError(apiError(err, "No se pudo crear el ticket"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Crear ticket de soporte</h1>
        <p className="text-sm text-slate-500">Reporta un incidente o solicitud de soporte técnico</p>
      </div>

      {error && <ErrorAlert message={error} />}

      <form onSubmit={submit} className="space-y-4">
        {/* Solicitante */}
        <div className="card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <User className="h-4 w-4 text-brand-600" /> Información del solicitante
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Nombre</label>
              <input className="input bg-slate-50" value={user?.name ?? ""} readOnly />
            </div>
            <div>
              <label className="label">Correo</label>
              <input className="input bg-slate-50" value={user?.email ?? ""} readOnly />
            </div>
            <div>
              <label className="label">Empresa</label>
              <input className="input bg-slate-50" value={companyName(user?.companyId) ?? "—"} readOnly />
            </div>
            <div>
              <label className="label">Departamento</label>
              <input className="input bg-slate-50" value={departmentName(user?.departmentId) ?? "—"} readOnly />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Teléfono</label>
              <input className="input bg-slate-50" value={user?.phone ?? "—"} readOnly />
            </div>
          </div>
          <p className="mt-2 flex items-center gap-1 text-xs text-slate-400">
            <Info className="h-3 w-3" /> Estos datos se cargan automáticamente desde tu perfil.
          </p>
        </div>

        {/* Incidente */}
        <div className="card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Info className="h-4 w-4 text-brand-600" /> Información del incidente
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Asunto *</label>
              <input
                className="input"
                required
                minLength={3}
                maxLength={200}
                placeholder="Ej.: No puedo imprimir desde mi equipo"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Categoría *</label>
              <select className="input" required value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId(""); }}>
                <option value="">Selecciona...</option>
                {categories.data?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Subcategoría</label>
              <select className="input" value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)} disabled={!selectedCategory}>
                <option value="">Selecciona...</option>
                {selectedCategory?.subcategories?.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Prioridad *</label>
              <select className="input" required value={priorityId} onChange={(e) => setPriorityId(e.target.value)}>
                <option value="">Selecciona...</option>
                {priorities.data?.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {p.description}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Ubicación</label>
              <input className="input" placeholder="Ej.: Oficina 302, 2do piso" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div>
              <label className="label">Equipo / dispositivo afectado</label>
              <input className="input" placeholder="Ej.: Laptop HP ProBook" value={device} onChange={(e) => setDevice(e.target.value)} />
            </div>
            <div>
              <label className="label">Número de inventario</label>
              <input className="input" placeholder="Ej.: INV-000123" value={inventoryNumber} onChange={(e) => setInventoryNumber(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Descripción detallada *</label>
              <textarea
                className="input min-h-32 resize-y"
                required
                minLength={10}
                maxLength={5000}
                placeholder="Describe el problema: qué ocurre, desde cuándo, qué has intentado..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Adjuntos */}
        <div className="card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Paperclip className="h-4 w-4 text-brand-600" /> Archivos adjuntos (opcional)
          </h2>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center hover:border-brand-400 hover:bg-brand-50/40">
            <Paperclip className="mb-2 h-6 w-6 text-slate-400" />
            <p className="text-sm font-medium text-slate-600">Haz clic para seleccionar archivos</p>
            <p className="mt-1 text-xs text-slate-400">Imágenes, PDF, documentos (máx. 10 MB por archivo, hasta 5)</p>
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </label>
          {files.length > 0 && (
            <ul className="mt-3 space-y-2">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 text-slate-600">
                    <Paperclip className="h-4 w-4 text-slate-400" />
                    <span className="truncate">{f.name}</span>
                    <span className="text-xs text-slate-400">{fmtBytes(f.size)}</span>
                  </span>
                  <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => setFiles((arr) => arr.filter((_, j) => j !== i))}>
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Cancelar</button>
          <button type="submit" disabled={loading} className="btn-primary">
            <Send className="h-4 w-4" />
            {loading ? "Creando ticket..." : "Crear ticket"}
          </button>
        </div>
      </form>
    </div>
  );
}
