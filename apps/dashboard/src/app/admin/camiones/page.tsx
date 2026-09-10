"use client";

import { Fragment, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import type {
  CreateTruckInput,
  ProductRecord,
  TruckCapacityEntry,
  TruckRecord,
} from "@distribuidor/shared";
import { useApiClient } from "../../../context/AuthContext";
import { TruckCalendar } from "../../../components/TruckCalendar";
import { formatTruckCapacities } from "../../../lib/format";

const EMPTY_FORM: CreateTruckInput = { code: "", plate: "" };

/**
 * La grilla se edita como STRINGS, no como numeros, por el mismo motivo que
 * la tabla de precios: `0` es una capacidad real ("este producto no viaja en
 * este camion") y el campo en blanco tiene que seguir siendo representable
 * para significar "no lo detallo". Con numeros los dos colapsarian en 0.
 */
type CapacityDraft = Record<string, string>;

const draftFromTruck = (truck: TruckRecord): CapacityDraft =>
  Object.fromEntries(
    truck.capacities.map((entry) => [entry.productCode, String(entry.units)]),
  );

export default function CamionesPage() {
  const api = useApiClient();

  const router = useRouter();
  const searchParams = useSearchParams();

  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState<CreateTruckInput>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Que camion tiene la grilla abierta, y el borrador que se esta editando.
  const [editingCapacityFor, setEditingCapacityFor] = useState<string | null>(null);
  const [capacityDraft, setCapacityDraft] = useState<CapacityDraft>({});
  const [savingCapacity, setSavingCapacity] = useState(false);

  const {
    data: trucks = [],
    isLoading,
    error: loadError,
    mutate: reloadTrucks,
  } = useSWR<TruckRecord[]>(`/trucks?includeInactive=${showInactive}`);

  // Solo los productos vigentes: la grilla es una decision que el admin toma
  // hoy, y ofrecerle uno dado de baja seria ofrecerle cargar algo que ya no
  // se vende.
  const { data: products = [] } = useSWR<ProductRecord[]>("/products");
  const activeProducts = products.filter((product) => product.isActive);

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
      });

      setForm(EMPTY_FORM);
      setNotice(`Camion ${form.code.trim()} creado. Cargale la capacidad por producto.`);
      await reloadTrucks();
    } catch {
      setActionError(
        "No se pudo crear el camion. Revisa que el codigo y la patente no esten repetidos.",
      );
    } finally {
      setCreating(false);
    }
  };

  const openCapacityEditor = (truck: TruckRecord) => {
    setActionError(null);
    setNotice(null);
    if (editingCapacityFor === truck.id) {
      setEditingCapacityFor(null);
      return;
    }
    setCapacityDraft(draftFromTruck(truck));
    setEditingCapacityFor(truck.id);
  };

  /**
   * Reemplazo total: se manda la grilla ENTERA. Un campo en blanco no viaja
   * como fila, y por eso borrarlo es como se saca un producto del camion.
   */
  const saveCapacities = async (truck: TruckRecord) => {
    const capacities: TruckCapacityEntry[] = [];

    for (const product of activeProducts) {
      const raw = (capacityDraft[product.code] ?? "").trim();
      if (raw.length === 0) {
        continue;
      }

      const units = Number(raw);
      if (!Number.isInteger(units) || units < 0) {
        setActionError(
          `La capacidad de ${product.code} debe ser un numero entero no negativo.`,
        );
        return;
      }

      capacities.push({ productCode: product.code, units });
    }

    try {
      setSavingCapacity(true);
      setActionError(null);
      setNotice(null);
      await api.put(`/trucks/${truck.id}/capacities`, { capacities });
      setNotice(`Capacidad de ${truck.code} actualizada.`);
      setEditingCapacityFor(null);
      await reloadTrucks();
    } catch {
      setActionError("No se pudo actualizar la capacidad.");
    } finally {
      setSavingCapacity(false);
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
          El codigo y la patente no se pueden repetir entre camiones. La capacidad
          se carga despues, producto por producto.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-sm text-slate-600">
            Codigo
            <input
              type="text"
              data-testid="new-truck-code"
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm text-slate-600">
            Patente
            <input
              type="text"
              data-testid="new-truck-plate"
              value={form.plate}
              onChange={(event) => setForm({ ...form, plate: event.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="button"
            data-testid="create-truck"
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
                  <th className="py-2 pr-4">Capacidad por producto</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {trucks.map((truck) => (
                  <Fragment key={truck.id}>
                    <tr
                      className={`border-b border-slate-100 ${
                        selectedTruckId === truck.id ? "bg-sky-50" : ""
                      }`}
                    >
                      <td className="py-2 pr-4 font-medium">{truck.code}</td>
                      <td className="py-2 pr-4">{truck.plate}</td>
                      <td
                        className={`py-2 pr-4 ${
                          truck.capacities.length === 0 ? "text-slate-400" : ""
                        }`}
                        data-testid={`capacity-${truck.id}`}
                      >
                        {formatTruckCapacities(truck.capacities)}
                      </td>
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
                                openCalendar(
                                  selectedTruckId === truck.id ? null : truck.id,
                                )
                              }
                              className="rounded bg-sky-700 px-3 py-1 font-semibold text-white hover:bg-sky-800"
                            >
                              {selectedTruckId === truck.id ? "Cerrar" : "Calendario"}
                            </button>
                          )}
                          <button
                            type="button"
                            data-testid={`edit-capacity-${truck.id}`}
                            onClick={() => openCapacityEditor(truck)}
                            className="rounded bg-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-300"
                          >
                            {editingCapacityFor === truck.id ? "Cerrar" : "Capacidad"}
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

                    {editingCapacityFor === truck.id && (
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <td colSpan={5} className="px-2 py-4">
                          <p className="text-sm text-slate-600">
                            Cuantas unidades de cada producto entran en {truck.code}.
                            Un campo vacio queda sin detallar; un 0 dice que ese
                            producto no viaja en este camion.
                          </p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                            {activeProducts.map((product) => (
                              <label
                                key={product.code}
                                className="text-sm text-slate-600"
                              >
                                {product.name}
                                <input
                                  type="number"
                                  min={0}
                                  data-testid={`capacity-input-${truck.id}-${product.code}`}
                                  value={capacityDraft[product.code] ?? ""}
                                  onChange={(event) =>
                                    setCapacityDraft({
                                      ...capacityDraft,
                                      [product.code]: event.target.value,
                                    })
                                  }
                                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                                />
                              </label>
                            ))}
                          </div>
                          {activeProducts.length === 0 && (
                            <p className="mt-3 text-sm text-slate-600">
                              No hay productos activos que cargar.
                            </p>
                          )}
                          <button
                            type="button"
                            data-testid={`save-capacity-${truck.id}`}
                            onClick={() => void saveCapacities(truck)}
                            disabled={savingCapacity}
                            className="mt-4 rounded bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                          >
                            {savingCapacity ? "Guardando..." : "Guardar capacidad"}
                          </button>
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
