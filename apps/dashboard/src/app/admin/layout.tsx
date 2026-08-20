"use client";

import type { ReactNode } from "react";
import AdminSidebar from "../../components/AdminSidebar";
import LoginScreen from "../../components/LoginScreen";
import { AuthProvider, useAuth } from "../../context/AuthContext";

/**
 * Puerta de entrada al panel: mientras se verifica el token no se renderiza
 * ninguna seccion, y sin sesion admin valida solo se ve el login.
 */
function AdminGuard({ children }: { children: ReactNode }) {
  const auth = useAuth();

  if (auth.status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-900">
        <p className="text-sm text-slate-600">Verificando sesion...</p>
      </div>
    );
  }

  if (auth.status !== "authenticated") {
    return (
      <LoginScreen
        username={auth.username}
        password={auth.password}
        onUsernameChange={auth.setUsername}
        onPasswordChange={auth.setPassword}
        onSubmit={() => void auth.login()}
        loading={auth.loading}
        error={auth.error}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 md:flex">
      <AdminSidebar />
      <div className="flex-1">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h1 className="text-lg font-bold">Sistema de Gestion de Reparto</h1>
            <p className="text-sm text-slate-600">Sesion: {auth.username}</p>
          </div>
          <button
            type="button"
            onClick={auth.logout}
            className="rounded bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Cerrar sesion
          </button>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <AuthProvider>
      <AdminGuard>{children}</AdminGuard>
    </AuthProvider>
  );
}
