import axios, { AxiosError } from "axios";

// Access token en memoria (no persistido); el refresh vive en cookie httpOnly
let accessToken: string | null = null;

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

// ---------- Renovación de sesión (una sola promesa compartida) ----------

interface RefreshResult {
  token: string | null;
  user: unknown;
}

let refreshPromise: Promise<RefreshResult | null> | null = null;

export function refreshSession(): Promise<RefreshResult | null> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post("/api/auth/refresh", {}, { withCredentials: true })
      .then((res) => ({
        token: (res.data?.token as string) ?? null,
        user: res.data?.user ?? null,
      }))
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// ---------- Cierre de sesión suave (sin recargas completas) ----------

let unauthorizedHandler: (() => void) | null = null;

/** El AuthContext registra aquí su cierre de sesión; evita window.location (parpadeos). */
export function setUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn;
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retried?: boolean }) | undefined;
    const isAuthEndpoint = original?.url?.includes("/auth/") ?? false;

    if (error.response?.status === 401 && original && !original._retried && !isAuthEndpoint) {
      original._retried = true;
      const result = await refreshSession();
      if (result?.token) {
        accessToken = result.token;
        return api(original);
      }
      // Sesión realmente expirada: cierre de sesión suave (sin recargar la página)
      accessToken = null;
      unauthorizedHandler?.();
    }
    return Promise.reject(error);
  },
);

/** Extrae el mensaje de error de una respuesta fallida. */
export function apiError(err: unknown, fallback = "Ocurrió un error"): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; message?: string } | undefined;
    if (data?.error) return data.error;
    if (data?.message) return data.message;
    if (err.code === "ERR_NETWORK") return "No se pudo conectar con el servidor";
  }
  return fallback;
}
