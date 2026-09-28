import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, KeyRound, User as UserIcon, Mail, Phone, Briefcase, Building2, ShieldCheck } from "lucide-react";
import { authApi } from "../api/endpoints";
import { apiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { ErrorAlert } from "../components/ui";
import { fmtDate } from "../utils/format";

export default function Profile() {
  const { user, setUser } = useAuth();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: authApi.me, enabled: !!user });

  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [position, setPosition] = useState(user?.position ?? "");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");

  const data = me.data ?? user;

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      const updated = await authApi.updateProfile({ name, phone: phone || null, position: position || null });
      setUser(updated);
      setMsg("Perfil actualizado correctamente");
      qc.invalidateQueries({ queryKey: ["me"] });
    } catch (error) {
      setErr(apiError(error));
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwErr("");
    setPwMsg("");
    if (newPw !== confirmPw) {
      setPwErr("Las contraseñas no coinciden");
      return;
    }
    try {
      await authApi.changePassword(curPw, newPw);
      setPwMsg("Contraseña actualizada correctamente");
      setCurPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (error) {
      setPwErr(apiError(error));
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Mi perfil</h1>
        <p className="text-sm text-slate-500">Consulta y actualiza tu información</p>
      </div>

      {/* Tarjeta de información */}
      <div className="card p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-2xl font-bold text-white">
            {data?.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">{data?.name}</h2>
            <p className="text-sm text-slate-500">{data?.role.name}</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <InfoRow icon={<Mail className="h-4 w-4" />} label="Correo" value={data?.email} />
          <InfoRow icon={<Phone className="h-4 w-4" />} label="Teléfono" value={data?.phone} />
          <InfoRow icon={<Briefcase className="h-4 w-4" />} label="Cargo" value={data?.position} />
          <InfoRow icon={<Building2 className="h-4 w-4" />} label="Empresa" value={data?.company?.name} />
          <InfoRow icon={<Building2 className="h-4 w-4" />} label="Departamento" value={data?.department?.name} />
          <InfoRow icon={<ShieldCheck className="h-4 w-4" />} label="Rol" value={data?.role.name} />
          <InfoRow icon={<UserIcon className="h-4 w-4" />} label="Miembro desde" value={data ? fmtDate(data.createdAt) : undefined} />
          <InfoRow icon={<UserIcon className="h-4 w-4" />} label="Último acceso" value={data?.lastLoginAt ? fmtDate(data.lastLoginAt) : undefined} />
        </div>
      </div>

      {/* Editar perfil */}
      <div className="card p-6">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Editar mi información</h3>
        {err && <ErrorAlert message={err} />}
        {msg && <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700">{msg}</div>}
        <form onSubmit={saveProfile} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Nombre completo</label>
            <input className="input" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Teléfono</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="label">Cargo</label>
            <input className="input" value={position} onChange={(e) => setPosition(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <button className="btn-primary" type="submit">
              <Save className="h-4 w-4" /> Guardar cambios
            </button>
          </div>
        </form>
      </div>

      {/* Cambiar contraseña */}
      <div className="card p-6">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <KeyRound className="h-4 w-4 text-brand-600" /> Cambiar contraseña
        </h3>
        {pwErr && <ErrorAlert message={pwErr} />}
        {pwMsg && <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700">{pwMsg}</div>}
        <form onSubmit={savePassword} className="space-y-3">
          <div>
            <label className="label">Contraseña actual</label>
            <input type="password" className="input" required value={curPw} onChange={(e) => setCurPw(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Nueva contraseña</label>
              <input type="password" className="input" required minLength={8} value={newPw} onChange={(e) => setNewPw(e.target.value)} />
            </div>
            <div>
              <label className="label">Confirmar contraseña</label>
              <input type="password" className="input" required value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
            </div>
          </div>
          <button className="btn-primary" type="submit">
            <KeyRound className="h-4 w-4" /> Actualizar contraseña
          </button>
        </form>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
      <span className="text-slate-400">{icon}</span>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-sm text-slate-700">{value ?? <span className="text-slate-400">—</span>}</p>
      </div>
    </div>
  );
}
