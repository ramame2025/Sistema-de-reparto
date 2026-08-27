"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { CreateUserInput, UserRole, UserSummary } from "@distribuidor/shared";
import { useApiClient } from "../../../context/AuthContext";

export default function UsuariosPage() {
  const api = useApiClient();

  const {
    data: users = [],
    isLoading,
    isValidating,
    error: loadError,
    mutate: reloadUsers,
  } = useSWR<UserSummary[]>("/users");

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("chofer");
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const error = actionError ?? (loadError ? "No se pudo cargar usuarios." : null);

  const createUser = async () => {
    const payload: CreateUserInput = {
      username: newUsername,
      password: newPassword,
      role: newRole,
    };

    try {
      setCreating(true);
      setActionError(null);
      setNotice(null);

      await api.post("/users", payload);

      setNewUsername("");
      setNewPassword("");
      setNewRole("chofer");
      setNotice("Usuario creado correctamente.");
      await reloadUsers();
    } catch {
      setActionError("No se pudo crear el usuario.");
    } finally {
      setCreating(false);
    }
  };

  const resetPassword = async (user: UserSummary) => {
    const nextPassword = window.prompt(`Nueva password para ${user.username}`);
    if (!nextPassword) {
      return;
    }

    try {
      setActionError(null);
      setNotice(null);
      await api.patch(`/users/${user.id}/password`, { password: nextPassword });
      setNotice(`Password actualizada para ${user.username}.`);
      await reloadUsers();
    } catch {
      setActionError("No se pudo actualizar la password.");
    }
  };

  const deleteUser = async (user: UserSummary) => {
    if (!window.confirm(`Eliminar usuario ${user.username}?`)) {
      return;
    }

    try {
      setActionError(null);
      setNotice(null);
      await api.remove(`/users/${user.id}`);
      setNotice(`Usuario ${user.username} eliminado.`);
      await reloadUsers();
    } catch {
      setActionError("No se pudo eliminar el usuario.");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold">Nuevo usuario</h2>
        <p className="mt-2 text-sm text-slate-600">
          Gestion de cuentas para roles admin y chofer.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <label className="text-sm text-slate-600">
            Usuario
            <input
              type="text"
              value={newUsername}
              onChange={(event) => setNewUsername(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm text-slate-600">
            Password
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm text-slate-600">
            Rol
            <select
              value={newRole}
              onChange={(event) => setNewRole(event.target.value as UserRole)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            >
              <option value="chofer">chofer</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void createUser()}
            disabled={creating || !newUsername.trim() || !newPassword}
            className="mt-6 h-10 rounded bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {creating ? "Creando..." : "Crear usuario"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
        {notice && <p className="mt-3 text-sm text-emerald-700">{notice}</p>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Usuarios</h2>
          <button
            type="button"
            onClick={() => void reloadUsers()}
            disabled={isValidating}
            className="rounded bg-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-300 disabled:cursor-not-allowed"
          >
            {isValidating ? "Actualizando..." : "Actualizar lista"}
          </button>
        </div>

        <p className="mt-2 text-sm text-slate-600">
          El camion se asigna desde el calendario de cada camion, no desde aca.
        </p>

        {isLoading && <p className="mt-4 text-slate-600">Cargando usuarios...</p>}

        {!isLoading && users.length === 0 && (
          <p className="mt-4 text-slate-600">Todavia no hay usuarios cargados.</p>
        )}

        {!isLoading && users.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4">Usuario</th>
                  <th className="py-2 pr-4">Rol</th>
                  <th className="py-2 pr-4">Camion hoy</th>
                  <th className="py-2 pr-4">Alta</th>
                  <th className="py-2 pr-4">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium">{user.username}</td>
                    <td className="py-2 pr-4">{user.role}</td>
                    <td className="py-2 pr-4">
                      {user.role !== "chofer" ? (
                        <span className="text-slate-400">—</span>
                      ) : user.currentTruck ? (
                        <Link
                          href={`/admin/camiones?truck=${user.currentTruck.truckId}`}
                          className="font-medium text-sky-700 underline hover:text-sky-900"
                        >
                          {user.currentTruck.code}
                          {user.currentTruck.kind === "cobertura" ? " (cobertura)" : ""}
                        </Link>
                      ) : (
                        <span className="text-slate-500">sin camion</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {new Date(user.createdAt).toLocaleDateString("es-AR")}
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void resetPassword(user)}
                          className="rounded bg-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-300"
                        >
                          Password
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteUser(user)}
                          className="rounded bg-rose-100 px-3 py-1 text-rose-800 hover:bg-rose-200"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
