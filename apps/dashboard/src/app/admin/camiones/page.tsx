"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import type { CreateTruckInput, TruckRecord } from "@distribuidor/shared";
import { useApiClient } from "../../../context/AuthContext";
import { TruckCalendar } from "../../../components/TruckCalendar";

const EMPTY_FORM: CreateTruckInput = { code: "", plate: "", capacity: 0 };

export default function CamionesPage() {
  const api = useApiClient();

  const router = useRouter();
  const searchParams = useSearchParams();

  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState<CreateTruckInput>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const {
    data: trucks = [],
    isLoading,
    error: loadError,
    mutate: reloadTrucks,
  } = useSWR<TruckRecord[]>(`/trucks?includeInactive=${showInactive}`);

  const error = actionError ?? (loadError ? "No se pudo cargar camiones." : null);

  // El camion abierto vive en la URL, no en estado local. Asi el calendario
  // se puede enlazar desde otra pantalla (la columna "camion hoy" de Usuarios)
  // y la seleccion se deriva en vez de sincronizarse con un efecto.
  const selectedTruckId = searchParams.get("truck");
  const selectedTruck = trucks.find((truck) => truck.id === selectedTruckId) ?? null;

  const openCalendar = (truckId: string | null) => {
    router.replace(truckId ? `/admin/camiones?truck=${truckId}` : "/admin/camiones");
  };

  const createTruck = async () => {
    try {
      setCreating(true);
      setActionError(null);
      setNotice(null);

      await api.post("/trucks", {
        code: form.code.trim(),
        plate: form.plate.trim(),
        capacity: form.capacity,
      });

      setForm(EMPTY_FORM);
      setNotice(`Camion ${form.code.trim()} creado.`);
      await reloadTrucks();
    } catch {
      setActionError(
        "No se pudo crear el camion. Revisa que el codigo y la patente no esten repetidos.",
      );
    } finally {
      setCreating(false);
    }
  };

  const updateCapacity = async (truck: TruckRecord) => {
    const raw = window.prompt(`Capacidad de ${truck.code}`, String(truck.capacity));
    if (raw === null) {
      return;
    }

    const capacity = Number(raw);
    if (!Number.isInteger(capacity) || capacity < 0) {
      setActionError("La capacidad debe ser un numero entero no negativo.");
      return;
    }

    try {
      setActionError(null);
      setNotice(null);
      await api.patch(`/trucks/${truck.id}`, { capacity });
      setNotice(`Capacidad de ${truck.code} actualizada a ${capacity}.`);
      await reloadTrucks();
    } catch {
      setActionError("No se pudo actualizar la capacidad.");
    }
  };

  const setActive = async (truck: TruckRecord, isActive: boolean) => {
    if (!isActive && !window.confirm(`Dar de baja el camion ${truck.code}?`)) {
      return;
    }

    try {
      setActionError(null);
      setNotice(null);
      await api.patch(`/trucks/${truck.id}`, { isActive });
      setNotice(`Camion ${truck.code} ${isActive ? "reactivado" : "dado de baja"}.`);
      if (!isActive && selectedTruckId === truck.id) {
        openCalendar(null);
      }
      await reloadTrucks();
    } catch {
      setActionError("No se pudo cambiar el estado del camion.");
    }
  };

  const canSubmit = form.code.trim().length > 0 && form.plate.trim().length > 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold">Nuevo camion</h2>
        <p className="mt-2 text-sm text-slate-600">
          El codigo y la patente no se pueden repetir entre camiones.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <label className="text-sm text-slate-600">
            Codigo
            <input
              type="text"
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm text-slate-600">
            Patente
            <input
              type="text"
              value={form.plate}
              onChange={(event) => setForm({ ...form, plate: event.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm text-slate-600">
            Capacidad
            <input
              type="number"
              min={0}
              value={form.capacity}
              onChange={(event) =>
                setForm({ ...form, capacity: Number(event.target.value) })
              }
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="button"
            onClick={() => void createTruck()}
            disabled={creating || !canSubmit}
            className="mt-6 h-10 rounded bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {creating ? "Creando..." : "Crear camion"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
        {notice && <p className="mt-3 text-sm text-emerald-700">{notice}</p>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Camiones</h2>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
            />
            Ver dados de baja
          </label>
        </div>

        {isLoading && <p className="mt-4 text-slate-600">Cargando camiones...</p>}

        {!isLoading && trucks.length === 0 && (
          <p className="mt-4 text-slate-600">
            Todavia no hay camiones cargados. Crea el primero arriba.
          </p>
        )}

        {!isLoading && trucks.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4">Codigo</th>
                  <th className="py-2 pr-4">Patente</th>
                  <th className="py-2 pr-4">Capacidad</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {trucks.map((truck) => (
                  <tr
                    key={truck.id}
                    className={`border-b border-slate-100 ${
                      selectedTruckId === truck.id ? "bg-sky-50" : ""
                    }`}
                  >
                    <td className="py-2 pr-4 font-medium">{truck.code}</td>
                    <td className="py-2 pr-4">{truck.plate}</td>
                    <td className="py-2 pr-4">{truck.capacity}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          truck.isActive
                            ? "rounded bg-emerald-100 px-2 py-1 text-emerald-800"
                            : "rounded bg-slate-200 px-2 py-1 text-slate-600"
                        }
                      >
                        {truck.isActive ? "activo" : "de baja"}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-2">
                        {truck.isActive && (
                          <button
                            type="button"
                            onClick={() =>
                              openCalendar(selectedTruckId === truck.id ? null : truck.id)
                            }
                            className="rounded bg-sky-700 px-3 py-1 font-semibold text-white hover:bg-sky-800"
                          >
                            {selectedTruckId === truck.id ? "Cerrar" : "Calendario"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void updateCapacity(truck)}
                          className="rounded bg-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-300"
                        >
                          Capacidad
                        </button>
                        <button
                          type="button"
                          onClick={() => void setActive(truck, !truck.isActive)}
                          className="rounded bg-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-300"
                        >
                          {truck.isActive ? "Dar de baja" : "Reactivar"}
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

      {selectedTruck && <TruckCalendar truck={selectedTruck} />}
    </div>
  );
}
