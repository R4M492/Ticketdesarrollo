import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Lock, ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import { authApi } from "../api/endpoints";
import { apiError } from "../api/client";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-slate-900 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-500" />
          <h2 className="text-lg font-semibold text-slate-800">Enlace inválido</h2>
          <p className="mt-1 text-sm text-slate-500">Falta el token de recuperación en la URL.</p>
          <Link to="/forgot-password" className="btn-primary mt-4">
            Solicitar nuevo enlace
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-slate-900 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <Link to="/login" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Volver al inicio de sesión
        </Link>
        <h2 className="text-lg font-semibold text-slate-800">Nueva contraseña</h2>
        <p className="mb-5 mt-1 text-sm text-slate-500">Define una nueva contraseña para tu cuenta.</p>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>}

        {done ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4" /> Contraseña actualizada correctamente.
            </p>
            <button className="btn-primary mt-4 w-full" onClick={() => navigate("/login")}>
              Ir a iniciar sesión
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">Nueva contraseña</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  required
                  className="input !pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="label">Confirmar contraseña</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  required
                  className="input !pl-9"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Guardando..." : "Guardar contraseña"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
