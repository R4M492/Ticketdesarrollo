import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { catalogApi } from "../../api/endpoints";
import { apiError } from "../../api/client";
import { Badge, EmptyState, ErrorAlert, Modal, PageLoader } from "../../components/ui";

export default function Departments() {
  const qc = useQueryClient();
  const companies = useQuery({ queryKey: ["companies"], queryFn: catalogApi.companies });
  const list = useQuery({ queryKey: ["departments"], queryFn: () => catalogApi.departments() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: number; companyId: number; name: string } | null>(null);
  const [form, setForm] = useState({ companyId: "", name: "" });
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");

  const openCreate = () => {
    setEditing(null);
    setForm({ companyId: companies.data?.[0] ? String(companies.data[0].id) : "", name: "" });
    setOpen(true);
  };
  const openEdit = (d: { id: number; companyId: number; name: string }) => {
    setEditing({ id: d.id, companyId: d.companyId, name: d.name });
    setForm({ companyId: String(d.companyId), name: d.name });
    setOpen(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      const payload = { companyId: Number(form.companyId), name: form.name };
      if (editing) {
        await catalogApi.updateDepartment(editing.id, payload);
        setSuccess("Departamento actualizado");
      } else {
        await catalogApi.createDepartment(payload);
        setSuccess("Departamento creado");
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["departments"] });
    } catch (error) {
      setErr(apiError(error));
    }
  };

  const remove = async (d: { id: number; name: string }) => {
    if (!confirm(`¿Eliminar el departamento "${d.name}"?`)) return;
    const res = await catalogApi.deleteDepartment(d.id);
    setSuccess(res.data.deactivated ? "El departamento tiene usuarios asociados: fue desactivado" : "Departamento eliminado");
    qc.invalidateQueries({ queryKey: ["departments"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Departamentos</h1>
          <p className="text-sm text-slate-500">Departamentos vinculados a empresas</p>
        </div>
        <button className="btn-primary" onClick={openCreate} disabled={!companies.data?.length}>
          <Plus className="h-4 w-4" /> Nuevo departamento
        </button>
      </div>

      {err && <ErrorAlert message={err} />}
      {success && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700">{success}</div>}

      {list.isLoading ? (
        <PageLoader />
      ) : list.data!.length === 0 ? (
        <div className="card"><EmptyState title="Sin departamentos" description="Primero crea una empresa y luego sus departamentos" /></div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Departamento</th>
                <th>Empresa</th>
                <th>Estado</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.data!.map((d) => (
                <tr key={d.id}>
                  <td className="font-medium text-slate-700">{d.name}</td>
                  <td className="text-sm text-slate-600">{d.company?.name ?? "—"}</td>
                  <td><Badge color={d.status === "ACTIVE" ? "#16a34a" : "#ef4444"}>{d.status === "ACTIVE" ? "Activo" : "Inactivo"}</Badge></td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <button className="btn-ghost !p-2" onClick={() => openEdit(d)}><Pencil className="h-4 w-4" /></button>
                      <button className="btn-ghost !p-2 text-red-500" onClick={() => remove(d)}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Editar departamento" : "Nuevo departamento"}>
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="label">Empresa *</label>
            <select className="input" required value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
              <option value="">Selecciona...</option>
              {companies.data?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Nombre *</label>
            <input className="input" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
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
