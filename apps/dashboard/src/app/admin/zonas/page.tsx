"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import type { UpdateZoneInput, ZoneRecord } from "@distribuidor/shared";
import { useApiClient } from "../../../context/AuthContext";
import { ApiError } from "../../../lib/api-client";

type NewZoneForm = {
  code: string;
  name: string;
};

const EMPTY_FORM: NewZoneForm = { code: "", name: "" };

export default function ZonasPage() {
  const api = useApiClient();

  const [form, setForm] = useState<NewZoneForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const {
    data: zones = [],
    isLoading,
    error: loadError,
    mutate: reloadZones,
  } = useSWR<ZoneRecord[]>("/zones?includeInactive=true");

  const error = actionError ?? (loadError ? "No se pudo cargar zonas." : null);

  const orderedZones = useMemo(
    () =>
      [...zones].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
    [zones],
  );

  // Una zona nueva se agrega al final de la lista.
  const nextSortOrder = useMemo(
    () => zones.reduce((max, zone) => Math.max(max, zone.sortOrder + 1), 0),
    [zones],
  );

  const createZone = async () => {
    const code = form.code.trim().toUpperCase();

    try {
      setCreating(true);
      setActionError(null);
      setNotice(null);

      await api.post("/zones", {
        code,
        name: form.name.trim(),
        sortOrder: nextSortOrder,
      });

      setForm(EMPTY_FORM);
      setNotice(`Zona ${code} creada.`);
      await reloadZones();
    } catch (err) {
      const duplicate = err instanceof ApiError && err.status === 409;
      setActionError(
        duplicate
          ? `Ya existe una zona con el codigo ${code}. Una zona dada de baja tampoco se puede reusar, porque los clientes que la tienen asignada la siguen referenciando.`
          : "No se pudo crear la zona.",
      );
    } finally {
      setCreating(false);
    }
  };

  const setActive = async (zone: ZoneRecord, isActive: boolean) => {
    // Dar de baja saca la zona de la lista con la que se dan de alta los
    // clientes; reactivar no rompe nada, asi que solo se pregunta al ocultarla.
    if (
      !isActive &&
      !window.confirm(
        `Dar de baja ${zone.name}? Deja de poder asignarse a clientes nuevos. Los que ya la tienen no se tocan.`,
      )
    ) {
      return;
    }

    try {
      setActionError(null);
      setNotice(null);
      await api.patch(`/zones/${zone.id}`, { isActive });
      setNotice(`${zone.name} ${isActive ? "reactivada" : "dada de baja"}.`);
      await reloadZones();
    } catch {
      setActionError("No se pudo cambiar el estado de la zona.");
    }
  };

  const canCreate =
    form.code.trim().length > 0 && form.name.trim().length >= 2;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold">Nueva zona</h2>
        <p className="mt-2 text-sm text-slate-600">
          El codigo no se puede cambiar despues: es la clave estable de la zona.
          El nombre si se puede renombrar cuando quieras.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-sm text-slate-600">
            Codigo
            <input
              type="text"
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 uppercase"
            />
          </label>
          <label className="text-sm text-slate-600">
            Nombre
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void createZone()}
          disabled={creating || !canCreate}
          className="mt-4 h-10 rounded bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {creating ? "Creando..." : "Crear zona"}
        </button>

        {error && (
          <p data-testid="zones-error" className="mt-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        {notice && (
          <p data-testid="zones-notice" className="mt-3 text-sm text-emerald-700">
            {notice}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold">Zonas de reparto</h2>

        {isLoading && <p className="mt-4 text-slate-600">Cargando zonas...</p>}

        {!isLoading && orderedZones.length === 0 && (
          <p data-testid="zones-empty" className="mt-4 text-slate-600">
            Todavia no hay zonas. Crea la primera arriba.
          </p>
        )}

        {!isLoading && orderedZones.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4">Codigo</th>
                  <th className="py-2 pr-4">Nombre</th>
                  <th className="py-2 pr-4">Orden</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {orderedZones.map((zone) => (
                  <ZoneRow
                    key={zone.id}
                    zone={zone}
                    api={api}
                    onSaved={async () => {
                      setActionError(null);
                      setNotice(`${zone.name} actualizada.`);
                      await reloadZones();
                    }}
                    onError={() => setActionError("No se pudo guardar la zona.")}
                    onToggleActive={() => void setActive(zone, !zone.isActive)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

type ZoneRowProps = {
  zone: ZoneRecord;
  api: ReturnType<typeof useApiClient>;
  onSaved: () => Promise<void>;
  onError: () => void;
  onToggleActive: () => void;
};

function ZoneRow({ zone, api, onSaved, onError, onToggleActive }: ZoneRowProps) {
  const [name, setName] = useState(zone.name);
  const [sortOrder, setSortOrder] = useState(zone.sortOrder);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const patch: UpdateZoneInput = {};
    if (name.trim() !== zone.name) {
      patch.name = name.trim();
    }
    if (sortOrder !== zone.sortOrder) {
      patch.sortOrder = sortOrder;
    }

    // Guardar sin cambios no manda nada: el validador rechaza un patch vacio,
    // y seria un error que el admin no causo.
    if (Object.keys(patch).length === 0) {
      return;
    }

    try {
      setSaving(true);
      await api.patch(`/zones/${zone.id}`, patch);
      await onSaved();
    } catch {
      onError();
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="border-b border-slate-100">
      <td className="py-2 pr-4 font-medium">{zone.code}</td>
      <td className="py-2 pr-4">
        <input
          type="text"
          data-testid={`name-${zone.id}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded border border-slate-300 px-2 py-1"
        />
      </td>
      <td className="py-2 pr-4">
        <input
          type="number"
          data-testid={`sort-${zone.id}`}
          value={sortOrder}
          onChange={(event) => setSortOrder(Number(event.target.value))}
          className="w-20 rounded border border-slate-300 px-2 py-1"
        />
      </td>
      <td className="py-2 pr-4">
        <span
          data-testid={`status-${zone.id}`}
          className={
            zone.isActive
              ? "rounded bg-emerald-100 px-2 py-1 text-emerald-800"
              : "rounded bg-slate-200 px-2 py-1 text-slate-600"
          }
        >
          {zone.isActive ? "activa" : "de baja"}
        </span>
      </td>
      <td className="py-2 pr-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid={`save-${zone.id}`}
            onClick={() => void save()}
            disabled={saving}
            className="rounded bg-sky-700 px-3 py-1 font-semibold text-white hover:bg-sky-800 disabled:bg-slate-400"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
          <button
            type="button"
            data-testid={`toggle-active-${zone.id}`}
            onClick={onToggleActive}
            className="rounded bg-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-300"
          >
            {zone.isActive ? "Dar de baja" : "Reactivar"}
          </button>
        </div>
      </td>
    </tr>
  );
}
