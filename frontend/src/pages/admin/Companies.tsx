import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";
import { catalogApi } from "../../api/endpoints";
import { apiError } from "../../api/client";
import { Badge, EmptyState, ErrorAlert, Modal, PageLoader } from "../../components/ui";

export default function Companies() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["companies"], queryFn: catalogApi.companies });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: number; name: string; description: string } | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", description: "" });
    setOpen(true);
  };
  const openEdit = (c: { id: number; name: string; description?: string | null }) => {
    setEditing({ id: c.id, name: c.name, description: c.description ?? "" });
    setForm({ name: c.name, description: c.description ?? "" });
    setOpen(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      if (editing) {
        await catalogApi.updateCompany(editing.id, form);
        setSuccess("Empresa actualizada");
      } else {
        await catalogApi.createCompany(form);
        setSuccess("Empresa creada");
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["companies"] });
    } catch (error) {
      setErr(apiError(error));
    }
  };

  const remove = async (id: number, name: string) => {
    if (!confirm(`¿Eliminar la empresa "${name}"? Los registros asociados se conservarán.`)) return;
    const res = await catalogApi.deleteCompany(id);
    setSuccess(res.data.deactivated ? "La empresa tiene usuarios asociados: fue desactivada" : "Empresa eliminada");
    qc.invalidateQueries({ queryKey: ["companies"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Empresas</h1>
          <p className="text-sm text-slate-500">Catálogo de empresas del sistema</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Nueva empresa
        </button>
      </div>

      {err && <ErrorAlert message={err} />}
      {success && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700">{success}</div>}

      {list.isLoading ? (
        <PageLoader />
      ) : list.data!.length === 0 ? (
        <div className="card"><EmptyState title="Sin empresas" description="Crea la primera empresa" /></div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Descripción</th>
                <th>Departamentos</th>
                <th>Estado</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.data!.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium text-slate-700">
                    <span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-slate-400" /> {c.name}</span>
                  </td>
                  <td className="text-sm text-slate-500">{c.description ?? "—"}</td>
                  <td className="text-sm text-slate-600">{c._count?.departments ?? 0}</td>
                  <td><Badge color={c.status === "ACTIVE" ? "#16a34a" : "#ef4444"}>{c.status === "ACTIVE" ? "Activa" : "Inactiva"}</Badge></td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <button className="btn-ghost !p-2" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></button>
                      <button className="btn-ghost !p-2 text-red-500" onClick={() => remove(c.id, c.name)}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Editar empresa" : "Nueva empresa"}>
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="label">Nombre *</label>
            <input className="input" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
            <button type="submit" className="btn-primary">Guardar</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
