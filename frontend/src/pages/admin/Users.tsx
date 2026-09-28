import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Power, KeyRound, Search } from "lucide-react";
import { usersApi, catalogApi } from "../../api/endpoints";
import { apiError } from "../../api/client";
import { Badge, EmptyState, ErrorAlert, Modal, PageLoader, Pagination } from "../../components/ui";
import { fmtDate } from "../../utils/format";
import type { User } from "../../types";

const ROLE_COLORS: Record<string, string> = { MASTER: "#7c3aed", TECNICO: "#0891b2", USUARIO: "#3f6aec" };

export default function Users() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetOpen, setResetOpen] = useState<User | null>(null);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");

  const list = useQuery({
    queryKey: ["users", page, search, roleFilter],
    queryFn: () => usersApi.list({ page, pageSize: 10, search: search || undefined, roleCode: roleFilter || undefined }),
  });
  const companies = useQuery({ queryKey: ["companies"], queryFn: catalogApi.companies });
  const departments = useQuery({ queryKey: ["departments"], queryFn: () => catalogApi.departments() });

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    roleCode: "USUARIO",
    phone: "",
    position: "",
    companyId: "",
    departmentId: "",
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", email: "", password: "", roleCode: "USUARIO", phone: "", position: "", companyId: "", departmentId: "" });
    setModalOpen(true);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setForm({
      name: u.name,
      email: u.email,
      password: "",
      roleCode: u.role.code,
      phone: u.phone ?? "",
      position: u.position ?? "",
      companyId: u.companyId ? String(u.companyId) : "",
      departmentId: u.departmentId ? String(u.departmentId) : "",
    });
    setModalOpen(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        roleCode: form.roleCode,
        phone: form.phone || null,
        position: form.position || null,
        companyId: form.companyId ? Number(form.companyId) : null,
        departmentId: form.departmentId ? Number(form.departmentId) : null,
      };
      if (editing) {
        await usersApi.update(editing.id, payload);
        setSuccess("Usuario actualizado");
      } else {
        await usersApi.create({ ...payload, password: form.password });
        setSuccess("Usuario creado");
      }
      setModalOpen(false);
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["technicians"] });
    } catch (error) {
      setErr(apiError(error));
    }
  };

  const toggleStatus = async (u: User) => {
    await usersApi.setStatus(u.id, u.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
    setSuccess(`Usuario ${u.status === "ACTIVE" ? "desactivado" : "activado"}`);
    qc.invalidateQueries({ queryKey: ["users"] });
  };

  const resetPassword = async (e: FormEvent) => {
    e.preventDefault();
    const pw = (e.target as HTMLFormElement).password.value;
    if (!resetOpen) return;
    await usersApi.resetPassword(resetOpen.id, pw);
    setResetOpen(null);
    setSuccess("Contraseña restablecida");
  };

  const deptOptions = form.companyId
    ? departments.data?.filter((d) => d.companyId === Number(form.companyId)) ?? []
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Usuarios</h1>
          <p className="text-sm text-slate-500">Crea y administra usuarios, técnicos y roles</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Nuevo usuario
        </button>
      </div>

      {err && <ErrorAlert message={err} />}
      {success && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700">{success}</div>}

      <div className="card flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input !pl-9" placeholder="Buscar por nombre, correo o cargo..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="input !w-auto" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}>
          <option value="">Todos los roles</option>
          <option value="MASTER">Jefe de Soporte</option>
          <option value="TECNICO">Técnico</option>
          <option value="USUARIO">Usuario</option>
        </select>
      </div>

      {list.isLoading ? (
        <PageLoader />
      ) : list.data!.data.length === 0 ? (
        <div className="card"><EmptyState title="Sin usuarios" description="Crea el primer usuario con el botón superior" /></div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base min-w-[800px]">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Contacto</th>
                <th>Empresa / Departamento</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Último acceso</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.data!.data.map((u) => (
                <tr key={u.id}>
                  <td>
                    <p className="font-medium text-slate-700">{u.name}</p>
                    <p className="text-xs text-slate-400">{u.position ?? "—"}</p>
                  </td>
                  <td>
                    <p className="text-sm text-slate-600">{u.email}</p>
                    <p className="text-xs text-slate-400">{u.phone ?? ""}</p>
                  </td>
                  <td>
                    <p className="text-sm text-slate-600">{u.company?.name ?? "—"}</p>
                    <p className="text-xs text-slate-400">{u.department?.name ?? ""}</p>
                  </td>
                  <td><Badge color={ROLE_COLORS[u.role.code] ?? "#64748b"}>{u.role.name}</Badge></td>
                  <td>
                    <Badge color={u.status === "ACTIVE" ? "#16a34a" : "#ef4444"}>
                      {u.status === "ACTIVE" ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className="text-xs text-slate-500">{u.lastLoginAt ? fmtDate(u.lastLoginAt) : "Nunca"}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <button className="btn-ghost !p-2" title="Editar" onClick={() => openEdit(u)}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button className="btn-ghost !p-2" title="Restablecer contraseña" onClick={() => setResetOpen(u)}>
                        <KeyRound className="h-4 w-4" />
                      </button>
                      <button
                        className="btn-ghost !p-2"
                        title={u.status === "ACTIVE" ? "Desactivar" : "Activar"}
                        onClick={() => toggleStatus(u)}
                      >
                        <Power className={`h-4 w-4 ${u.status === "ACTIVE" ? "text-red-500" : "text-green-600"}`} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={list.data!.page} pageSize={list.data!.pageSize} total={list.data!.total} onChange={setPage} />
        </div>
      )}

      {/* Modal crear/editar */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Editar usuario: ${editing.name}` : "Nuevo usuario"} size="lg">
        <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Nombre completo *</label>
            <input className="input" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Correo electrónico *</label>
            <input type="email" className="input" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label">{editing ? "Nueva contraseña (dejar vacío para no cambiar)" : "Contraseña *"}</label>
            <input type="password" className="input" minLength={8} required={!editing} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <label className="label">Rol *</label>
            <select className="input" required value={form.roleCode} onChange={(e) => setForm({ ...form, roleCode: e.target.value })}>
              <option value="USUARIO">Usuario / Solicitante</option>
              <option value="TECNICO">Técnico / Agente</option>
              <option value="MASTER">Jefe de Soporte (MASTER)</option>
            </select>
          </div>
          <div>
            <label className="label">Teléfono</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="label">Cargo</label>
            <input className="input" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
          </div>
          <div>
            <label className="label">Empresa</label>
            <select className="input" value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value, departmentId: "" })}>
              <option value="">Sin empresa</option>
              {companies.data?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Departamento</label>
            <select className="input" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} disabled={!form.companyId}>
              <option value="">Selecciona...</option>
              {deptOptions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button type="submit" className="btn-primary">{editing ? "Guardar cambios" : "Crear usuario"}</button>
          </div>
        </form>
      </Modal>

      {/* Modal reset contraseña */}
      <Modal open={!!resetOpen} onClose={() => setResetOpen(null)} title={`Restablecer contraseña de ${resetOpen?.name ?? ""}`}>
        <form onSubmit={resetPassword} className="space-y-3">
          <div>
            <label className="label">Nueva contraseña *</label>
            <input type="password" name="password" className="input" required minLength={8} placeholder="Mínimo 8 caracteres" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setResetOpen(null)}>Cancelar</button>
            <button type="submit" className="btn-primary">Restablecer</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
