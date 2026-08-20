"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AuthLoginResponse,
  AuthSessionResponse,
} from "@distribuidor/shared";
import { createApiClient } from "../lib/api-client";
import { API_URL, DASHBOARD_AUTH_TOKEN_KEY } from "../lib/config";

export type AuthStatus = "checking" | "anonymous" | "authenticated";

type AuthContextValue = {
  status: AuthStatus;
  token: string | null;
  username: string;
  password: string;
  loading: boolean;
  error: string | null;
  setUsername: (value: string) => void;
  setPassword: (value: string) => void;
  login: () => Promise<void>;
  logout: () => void;
  /** Ante un 401/403 la sesion dejo de ser valida: volvemos al login. */
  handleAuthFailure: (response: Response) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearSession = useCallback(() => {
    setToken(null);
    setStatus("anonymous");
    localStorage.removeItem(DASHBOARD_AUTH_TOKEN_KEY);
  }, []);

  const handleAuthFailure = useCallback(
    (response: Response) => {
      if (response.status === 401 || response.status === 403) {
        clearSession();
      }
    },
    [clearSession],
  );

  // Validamos el token guardado contra la API antes de mostrar el dashboard,
  // asi un token vencido o manipulado vuelve al login en vez de entrar.
  useEffect(() => {
    let active = true;

    const verifySession = async () => {
      try {
        const savedToken = localStorage.getItem(DASHBOARD_AUTH_TOKEN_KEY);
        if (!savedToken) {
          throw new Error("no token");
        }

        const response = await fetch(`${API_URL}/auth/me`, {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${savedToken}`,
          },
        });

        if (!response.ok) {
          throw new Error(`API ${response.status}`);
        }

        const session: AuthSessionResponse = await response.json();
        if (!active) {
          return;
        }

        if (session.role !== "admin") {
          throw new Error("role");
        }

        setUsername(session.username);
        setToken(savedToken);
        setStatus("authenticated");
      } catch {
        if (!active) {
          return;
        }

        localStorage.removeItem(DASHBOARD_AUTH_TOKEN_KEY);
        setToken(null);
        setStatus("anonymous");
      }
    };

    void verifySession();

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        throw new Error(`API ${response.status}`);
      }

      const payload: AuthLoginResponse = await response.json();
      if (payload.role !== "admin") {
        setError("Este usuario no tiene permisos de administrador.");
        return;
      }

      setToken(payload.accessToken);
      setStatus("authenticated");
      setPassword("");
      localStorage.setItem(DASHBOARD_AUTH_TOKEN_KEY, payload.accessToken);
    } catch {
      setError("Credenciales invalidas o API no disponible.");
    } finally {
      setLoading(false);
    }
  }, [password, username]);

  const logout = useCallback(() => {
    clearSession();
    setPassword("");
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      token,
      username,
      password,
      loading,
      error,
      setUsername,
      setPassword,
      login,
      logout,
      handleAuthFailure,
    }),
    [
      status,
      token,
      username,
      password,
      loading,
      error,
      login,
      logout,
      handleAuthFailure,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}

/** Cliente de API ligado a la sesion actual. Se rehace solo si cambia el token. */
export function useApiClient() {
  const { token, handleAuthFailure } = useAuth();

  return useMemo(
    () => createApiClient(token, handleAuthFailure),
    [token, handleAuthFailure],
  );
}
