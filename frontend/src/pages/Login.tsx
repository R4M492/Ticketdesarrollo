import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Headset, Lock, Mail, AlertTriangle, LogIn } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { apiError } from "../api/client";
import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "../api/endpoints";

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: settings } = useQuery({ queryKey: ["settings-public"], queryFn: () => settingsApi.get().catch(() => null), retry: false });

  if (user) {
    return <Navigate to="/" replace />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password, rememberMe);
      navigate("/", { replace: true });
    } catch (err) {
      setError(apiError(err, "No se pudo iniciar sesión"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-white">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <Headset className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">{settings?.systemName || "HelpDesk — Soporte Técnico"}</h1>
          <p className="mt-1 text-sm text-brand-100">Gestión de tickets para soporte técnico</p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
          <h2 className="text-lg font-semibold text-slate-800">Iniciar sesión</h2>
          <p className="mb-5 mt-1 text-sm text-slate-500">Ingresa con tu correo corporativo</p>

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">Correo electrónico</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  className="input !pl-9"
                  placeholder="correo@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>
            <div>
              <label className="label">Contraseña</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  required
                  className="input !pl-9"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                Recordar sesión
              </label>
              <Link to="/forgot-password" className="text-sm font-medium text-brand-600 hover:underline">
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full !py-2.5">
              <LogIn className="h-4 w-4" />
              {loading ? "Ingresando..." : "Iniciar sesión"}
            </button>
          </form>

          <div className="mt-6 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            <p className="mb-1 font-semibold text-slate-600">Cuentas de demostración:</p>
            <p>Jefe: jefe.soporte@empresa.com / Admin123!</p>
            <p>Técnico: carlos.tec@empresa.com / Tecnico123!</p>
            <p>Usuario: maria.usuario@empresa.com / Usuario123!</p>
          </div>
        </div>
      </div>
    </div>
  );
}
