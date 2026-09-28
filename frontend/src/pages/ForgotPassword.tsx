import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Mail, ArrowLeft, Send, CheckCircle2 } from "lucide-react";
import { authApi } from "../api/endpoints";
import { apiError } from "../api/client";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ message: string; token?: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authApi.forgotPassword(email);
      setDone({ message: res.data.message, token: res.data.devResetToken });
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-slate-900 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <Link to="/login" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Volver al inicio de sesión
        </Link>
        <h2 className="text-lg font-semibold text-slate-800">Recuperar contraseña</h2>
        <p className="mb-5 mt-1 text-sm text-slate-500">
          Ingresa tu correo y te enviaremos instrucciones para restablecerla.
        </p>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>}

        {done ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4" /> {done.message}
            </p>
            {done.token && (
              <div className="mt-3 rounded border border-green-200 bg-white p-3">
                <p className="mb-1 text-xs font-semibold text-green-800">Enlace de recuperación (solo desarrollo):</p>
                <Link to={`/reset-password?token=${done.token}`} className="break-all text-xs font-medium text-brand-600 underline">
                  /reset-password?token={done.token}
                </Link>
              </div>
            )}
          </div>
        ) : (
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
                />
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              <Send className="h-4 w-4" />
              {loading ? "Enviando..." : "Enviar instrucciones"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
