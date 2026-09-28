import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, FolderTree } from "lucide-react";
import { catalogApi } from "../../api/endpoints";
import { apiError } from "../../api/client";
import { Badge, EmptyState, ErrorAlert, Modal, PageLoader } from "../../components/ui";
import type { Category, Subcategory } from "../../types";

export default function Categories() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["categories"], queryFn: catalogApi.categories });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [catOpen, setCatOpen] = useState(false);
  const [subOpen, setSubOpen] = useState<{ category: Category | null; sub?: Subcategory | null }>({ category: null, sub: null });
  const [catForm, setCatForm] = useState({ name: "", description: "" });
  const [subForm, setSubForm] = useState({ name: "" });
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveCat = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (catForm.name.includes("__edit__")) {
        // no-op guard
      }
      await catalogApi.createCategory(catForm);
      setSuccess("Categoría creada");
      setCatOpen(false);
      setCatForm({ name: "", description: "" });
      qc.invalidateQueries({ queryKey: ["categories"] });
    } catch (error) {
      setErr(apiError(error));
    }
  };

  const saveSub = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const category = subOpen.category!;
      if (subOpen.sub) {
        await catalogApi.updateSubcategory(subOpen.sub.id, { categoryId: category.id, name: subForm.name });
        setSuccess("Subcategoría actualizada");
      } else {
        await catalogApi.createSubcategory({ categoryId: category.id, name: subForm.name });
        setSuccess("Subcategoría creada");
      }
      setSubOpen({ category: null, sub: null });
      qc.invalidateQueries({ queryKey: ["categories"] });
    } catch (error) {
      setErr(apiError(error));
    }
  };

  const removeCat = async (c: Category) => {
    if (!confirm(`¿Eliminar la categoría "${c.name}"?`)) return;
    const res = await catalogApi.deleteCategory(c.id);
    setSuccess(res.data.deactivated ? "Categoría con tickets asociados: fue desactivada" : "Categoría eliminada");
    qc.invalidateQueries({ queryKey: ["categories"] });
  };

  const removeSub = async (s: Subcategory) => {
    if (!confirm(`¿Eliminar la subcategoría "${s.name}"?`)) return;
    await catalogApi.deleteSubcategory(s.id);
    qc.invalidateQueries({ queryKey: ["categories"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
            <FolderTree className="h-5 w-5 text-brand-600" /> Categorías y subcategorías
          </h1>
          <p className="text-sm text-slate-500">Catálogo de tipos de incidentes</p>
        </div>
        <button className="btn-primary" onClick={() => { setCatForm({ name: "", description: "" }); setCatOpen(true); }}>
          <Plus className="h-4 w-4" /> Nueva categoría
        </button>
      </div>

      {err && <ErrorAlert message={err} />}
      {success && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700">{success}</div>}

      {list.isLoading ? (
        <PageLoader />
      ) : list.data!.length === 0 ? (
        <div className="card"><EmptyState title="Sin categorías" description="Crea la primera categoría" /></div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {list.data!.map((c) => (
            <div key={c.id}>
              <div className="flex items-center justify-between px-4 py-3">
                <button className="flex flex-1 items-center gap-2 text-left" onClick={() => toggle(c.id)}>
                  {expanded.has(c.id) ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                  <span className="font-medium text-slate-700">{c.name}</span>
                  <Badge color="#64748b">{c.subcategories?.length ?? 0} subcategorías</Badge>
                  <Badge color={c.status === "ACTIVE" ? "#16a34a" : "#ef4444"}>{c.status === "ACTIVE" ? "Activa" : "Inactiva"}</Badge>
                </button>
                <div className="flex gap-1">
                  <button className="btn-ghost !p-2" onClick={() => { setSubOpen({ category: c, sub: null }); setSubForm({ name: "" }); }}>
                    <Plus className="h-4 w-4" /> <span className="text-xs">Sub</span>
                  </button>
                  <button className="btn-ghost !p-2" onClick={() => removeCat(c)}><Trash2 className="h-4 w-4 text-red-500" /></button>
                </div>
              </div>
              {expanded.has(c.id) && (
                <div className="border-t border-slate-100 bg-slate-50 px-6 py-3">
                  {c.description && <p className="mb-2 text-xs text-slate-500">{c.description}</p>}
                  <ul className="space-y-1">
                    {c.subcategories?.map((s) => (
                      <li key={s.id} className="flex items-center justify-between rounded px-2 py-1 text-sm text-slate-600 hover:bg-white">
                        <span>{s.name}</span>
                        <div className="flex gap-1">
                          <button className="btn-ghost !p-1.5" onClick={() => { setSubOpen({ category: c, sub: s }); setSubForm({ name: s.name }); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button className="btn-ghost !p-1.5 text-red-500" onClick={() => removeSub(s)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                    {(!c.subcategories || c.subcategories.length === 0) && (
                      <li className="text-xs text-slate-400">Sin subcategorías</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={catOpen} onClose={() => setCatOpen(false)} title="Nueva categoría">
        <form onSubmit={saveCat} className="space-y-3">
          <div>
            <label className="label">Nombre *</label>
            <input className="input" required minLength={2} value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea className="input" rows={2} value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setCatOpen(false)}>Cancelar</button>
            <button type="submit" className="btn-primary">Crear</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!subOpen.category} onClose={() => setSubOpen({ category: null, sub: null })} title={subOpen.sub ? "Editar subcategoría" : `Nueva subcategoría en ${subOpen.category?.name}`}>
        <form onSubmit={saveSub} className="space-y-3">
          <div>
            <label className="label">Nombre *</label>
            <input className="input" required minLength={2} value={subForm.name} onChange={(e) => setSubForm({ name: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setSubOpen({ category: null, sub: null })}>Cancelar</button>
            <button type="submit" className="btn-primary">Guardar</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
