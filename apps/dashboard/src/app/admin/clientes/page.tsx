"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  CUSTOMER_TYPES,
  normalizeCustomerName,
  type CustomerRecord,
  type CustomerType,
  type UpdateCustomerInput,
} from "@distribuidor/shared";
import { useApiClient } from "../../../context/AuthContext";
import { LocationPicker, type LocationValue } from "../../../components/LocationPicker";
import { ApiError } from "../../../lib/api-client";

type CreateForm = {
  name: string;
  customerType: CustomerType;
  zone: string;
  address: string;
  latitude?: number;
  longitude?: number;
};

const EMPTY_FORM: CreateForm = {
  name: "",
  customerType: "final",
  zone: "",
  address: "",
};

/**
 * El par de coordenadas se aplica entero o no se aplica: la API rechaza una
 * mitad suelta, porque un registro con una sola coordenada parece ubicado
 * pero no se puede ordenar por cercania.
 */
function applyLocation<T extends { latitude?: number; longitude?: number }>(
  target: T,
  value: LocationValue,
): T {
  return {
    ...target,
    latitude: value.latitude ?? undefined,
    longitude: value.longitude ?? undefined,
  };
}

/** El 409 de POST /customers viaja con el cliente que ya existe. */
type DuplicateConflict = { customer: CustomerRecord };

function conflictFrom(error: unknown): DuplicateConflict | null {
  if (!(error instanceof ApiError) || error.status !== 409) {
    return null;
  }

  const body = error.body as { customer?: CustomerRecord } | undefined;
  return body?.customer ? { customer: body.customer } : null;
}

/** Ubicado es tener el par completo: media coordenada no sirve para ordenar. */
function isLocated(customer: CustomerRecord): boolean {
  return customer.latitude !== undefined && customer.longitude !== undefined;
}

/** Un campo de texto vacio se omite del alta; nunca se manda cadena vacia. */
function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export default function ClientesPage() {
  const api = useApiClient();

  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [search, setSearch] = useState("");
  const [onlyWithoutLocation, setOnlyWithoutLocation] = useState(false);
  const [creating, setCreating] = useState(false);
  const [duplicate, setDuplicate] = useState<DuplicateConflict | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const {
    data: customers = [],
    isLoading,
    error: loadError,
    mutate: reloadCustomers,
  } = useSWR<CustomerRecord[]>("/customers");

  const error = actionError ?? (loadError ? "No se pudo cargar clientes." : null);

  const visibleCustomers = useMemo(() => {
    const needle = normalizeCustomerName(search);

    // Los dos filtros se combinan; el de ubicacion no reemplaza al buscador.
    return customers.filter((customer) => {
      if (onlyWithoutLocation && isLocated(customer)) {
        return false;
      }
      if (needle.length === 0) {
        return true;
      }
      return normalizeCustomerName(customer.name).includes(needle);
    });
  }, [customers, search, onlyWithoutLocation]);

  // Un cliente sin pin no aparece en "Cerca tuyo" para el chofer. Contarlos
  // evita que el padron se degrade en silencio.
  const withoutLocation = useMemo(
    () => customers.filter((customer) => !isLocated(customer)).length,
    [customers],
  );

  const buildCreatePayload = () => ({
    name: form.name.trim(),
    customerType: form.customerType,
    ...(optionalText(form.zone) ? { zone: optionalText(form.zone) } : {}),
    ...(optionalText(form.address) ? { address: optionalText(form.address) } : {}),
    ...(form.latitude !== undefined && form.longitude !== undefined
      ? { latitude: form.latitude, longitude: form.longitude }
      : {}),
  });

  const submitCreate = async (allowDuplicate: boolean) => {
    const payload = buildCreatePayload();

    try {
      setCreating(true);
      setActionError(null);
      setNotice(null);

      await api.post(
        allowDuplicate ? "/customers?allowDuplicate=true" : "/customers",
        payload,
      );

      setForm(EMPTY_FORM);
      setDuplicate(null);
      setNotice(`Cliente ${payload.name} creado.`);
      await reloadCustomers();
    } catch (err) {
      const conflict = conflictFrom(err);
      if (conflict) {
        // Ni bloqueo duro ni alta silenciosa: se nombra el cliente en
        // conflicto y el admin decide.
        setDuplicate(conflict);
        return;
      }
      setActionError("No se pudo crear el cliente.");
    } finally {
      setCreating(false);
    }
  };

  const deactivate = async (customer: CustomerRecord) => {
    if (!window.confirm(`Dar de baja a ${customer.name}?`)) {
      return;
    }

    try {
      setActionError(null);
      setNotice(null);
      await api.remove(`/customers/${customer.id}`);
      setNotice(`Cliente ${customer.name} dado de baja.`);
      await reloadCustomers();
    } catch {
      setActionError("No se pudo dar de baja al cliente.");
    }
  };

  const saveEdit = async (customer: CustomerRecord, patch: UpdateCustomerInput) => {
    // Un guardado sin cambios no debe llegar a la API: el validador rechaza
    // un patch vacio, y seria un error que el admin no causo.
    if (Object.keys(patch).length === 0) {
      setEditingId(null);
      return;
    }

    try {
      setActionError(null);
      setNotice(null);
      await api.patch(`/customers/${customer.id}`, patch);
      setEditingId(null);
      setNotice(`Cliente ${customer.name} actualizado.`);
      await reloadCustomers();
    } catch {
      setActionError("No se pudo actualizar el cliente.");
    }
  };

  const canSubmit = form.name.trim().length >= 2;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold">Nuevo cliente</h2>
        <p className="mt-2 text-sm text-slate-600">
          La zona y la direccion son opcionales. La ubicacion en el mapa se carga
          por separado.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <label className="text-sm text-slate-600">
            Nombre
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm text-slate-600">
            Tipo
            <select
              value={form.customerType}
              onChange={(event) =>
                setForm({ ...form, customerType: event.target.value as CustomerType })
              }
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            >
              {CUSTOMER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-600">
            Zona
            <input
              type="text"
              value={form.zone}
              onChange={(event) => setForm({ ...form, zone: event.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm text-slate-600">
            Direccion
            <input
              type="text"
              value={form.address}
              onChange={(event) => setForm({ ...form, address: event.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
        </div>

        <div className="mt-4">
          <LocationPicker
            latitude={form.latitude}
            longitude={form.longitude}
            onChange={(value) => setForm(applyLocation(form, value))}
          />
        </div>

        <button
          type="button"
          onClick={() => void submitCreate(false)}
          disabled={creating || !canSubmit}
          className="mt-4 h-10 rounded bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {creating ? "Creando..." : "Crear cliente"}
        </button>

        {duplicate && (
          <div
            data-testid="duplicate-warning"
            className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
          >
            <p>
              Ya existe un cliente llamado <strong>{duplicate.customer.name}</strong>
              {duplicate.customer.zone ? ` en la zona ${duplicate.customer.zone}` : ""}.
              Si es el mismo, edita ese. Si es otro distinto, crealo igual.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void submitCreate(true)}
                className="rounded bg-amber-700 px-3 py-1 font-semibold text-white hover:bg-amber-800"
              >
                Crear igual
              </button>
              <button
                type="button"
                onClick={() => setDuplicate(null)}
                className="rounded bg-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-300"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
        {notice && <p className="mt-3 text-sm text-emerald-700">{notice}</p>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Clientes</h2>
          <div className="flex flex-wrap items-center gap-4">
            <span
              data-testid="customers-without-location"
              className="rounded bg-slate-100 px-3 py-1 text-sm text-slate-700"
            >
              Sin ubicacion: {withoutLocation}
            </span>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={onlyWithoutLocation}
                onChange={(event) => setOnlyWithoutLocation(event.target.checked)}
              />
              Solo sin ubicacion
            </label>
            <label className="text-sm text-slate-600">
              Buscar
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="ml-2 rounded border border-slate-300 px-3 py-1"
              />
            </label>
          </div>
        </div>

        {isLoading && <p className="mt-4 text-slate-600">Cargando clientes...</p>}

        {!isLoading && visibleCustomers.length === 0 && (
          <p data-testid="customers-empty" className="mt-4 text-slate-600">
            No hay clientes para mostrar.
          </p>
        )}

        {!isLoading && visibleCustomers.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4">Nombre</th>
                  <th className="py-2 pr-4">Tipo</th>
                  <th className="py-2 pr-4">Zona</th>
                  <th className="py-2 pr-4">Direccion</th>
                  <th className="py-2 pr-4">Ubicacion</th>
                  <th className="py-2 pr-4">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleCustomers.map((customer) => (
                  <CustomerRow
                    key={customer.id}
                    customer={customer}
                    editing={editingId === customer.id}
                    onEdit={() => setEditingId(customer.id)}
                    onCancel={() => setEditingId(null)}
                    onSave={(patch) => void saveEdit(customer, patch)}
                    onDeactivate={() => void deactivate(customer)}
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

type CustomerRowProps = {
  customer: CustomerRecord;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (patch: UpdateCustomerInput) => void;
  onDeactivate: () => void;
};

function CustomerRow({
  customer,
  editing,
  onEdit,
  onCancel,
  onSave,
  onDeactivate,
}: CustomerRowProps) {
  const [name, setName] = useState(customer.name);
  const [customerType, setCustomerType] = useState<CustomerType>(customer.customerType);
  const [zone, setZone] = useState(customer.zone ?? "");
  const [address, setAddress] = useState(customer.address ?? "");
  // `undefined` significa "no se toco el pin"; un LocationValue significa que
  // el admin lo movio o lo saco, incluso si vuelve a coincidir con lo guardado.
  const [pin, setPin] = useState<LocationValue | undefined>(undefined);

  const located = isLocated(customer);

  const editedLatitude = pin ? (pin.latitude ?? undefined) : customer.latitude;
  const editedLongitude = pin ? (pin.longitude ?? undefined) : customer.longitude;

  const buildPatch = (): UpdateCustomerInput => {
    const patch: UpdateCustomerInput = {};

    if (name.trim() !== customer.name) {
      patch.name = name.trim();
    }
    if (customerType !== customer.customerType) {
      patch.customerType = customerType;
    }
    // Vaciar el campo limpia el valor guardado, y eso solo se puede expresar
    // con null: undefined significaria "no lo toques".
    if (zone.trim() !== (customer.zone ?? "")) {
      patch.zone = zone.trim().length > 0 ? zone.trim() : null;
    }
    if (address.trim() !== (customer.address ?? "")) {
      patch.address = address.trim().length > 0 ? address.trim() : null;
    }
    if (pin) {
      patch.latitude = pin.latitude;
      patch.longitude = pin.longitude;
    }

    return patch;
  };

  if (!editing) {
    return (
      <tr className="border-b border-slate-100">
        <td className="py-2 pr-4 font-medium">{customer.name}</td>
        <td className="py-2 pr-4">{customer.customerType}</td>
        <td className="py-2 pr-4">{customer.zone ?? "-"}</td>
        <td className="py-2 pr-4">{customer.address ?? "-"}</td>
        <td className="py-2 pr-4">
          <span
            className={
              located
                ? "rounded bg-emerald-100 px-2 py-1 text-emerald-800"
                : "rounded bg-amber-100 px-2 py-1 text-amber-800"
            }
          >
            {located ? "con pin" : "sin ubicacion"}
          </span>
        </td>
        <td className="py-2 pr-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid={`edit-${customer.id}`}
              onClick={onEdit}
              className="rounded bg-sky-700 px-3 py-1 font-semibold text-white hover:bg-sky-800"
            >
              Editar
            </button>
            <button
              type="button"
              data-testid={`deactivate-${customer.id}`}
              onClick={onDeactivate}
              className="rounded bg-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-300"
            >
              Dar de baja
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-slate-100 bg-sky-50">
      <td className="py-2 pr-4">
        <label className="text-xs text-slate-600">
          Nombre del cliente
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
          />
        </label>
      </td>
      <td className="py-2 pr-4">
        <label className="text-xs text-slate-600">
          Tipo del cliente
          <select
            value={customerType}
            onChange={(event) => setCustomerType(event.target.value as CustomerType)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
          >
            {CUSTOMER_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
      </td>
      <td className="py-2 pr-4">
        <label className="text-xs text-slate-600">
          Zona del cliente
          <input
            type="text"
            value={zone}
            onChange={(event) => setZone(event.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
          />
        </label>
      </td>
      <td className="py-2 pr-4" colSpan={2}>
        <label className="text-xs text-slate-600">
          Direccion del cliente
          <input
            type="text"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <div className="mt-3">
          <LocationPicker
            latitude={editedLatitude}
            longitude={editedLongitude}
            onChange={setPin}
          />
        </div>
      </td>
      <td className="py-2 pr-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSave(buildPatch())}
            className="rounded bg-sky-700 px-3 py-1 font-semibold text-white hover:bg-sky-800"
          >
            Guardar cambios
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded bg-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-300"
          >
            Cancelar edicion
          </button>
        </div>
      </td>
    </tr>
  );
}
