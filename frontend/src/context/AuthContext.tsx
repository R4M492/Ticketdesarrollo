import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setAccessToken, refreshSession, setUnauthorizedHandler } from "../api/client";
import { authApi } from "../api/endpoints";
import type { User } from "../types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe: boolean) => Promise<User>;
  logout: () => Promise<void>;
  setUser: (u: User | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Cierre de sesión suave cuando el refresh falla (sin recargar la página)
    setUnauthorizedHandler(() => {
      setAccessToken(null);
      setUser(null);
    });

    // Al cargar la app, renovar la sesión con la cookie de refresh (una sola llamada)
    (async () => {
      const result = await refreshSession();
      if (!active) return;
      if (result?.token) {
        setAccessToken(result.token);
        if (result.user) setUser(result.user as User);
      }
      setLoading(false);
    })();

    return () => {
      active = false;
      setUnauthorizedHandler(null);
    };
  }, []);

  const login = useCallback(async (email: string, password: string, rememberMe: boolean) => {
    const res = await api.post("/auth/login", { email, password, rememberMe });
    setAccessToken(res.data.token);
    setUser(res.data.user);
    return res.data.user as User;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // ignorar
    }
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setUser }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
