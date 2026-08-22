"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import type {
  CustomerRecord,
  DriverCustomerAssignmentRecord,
  UserSummary,
} from "@distribuidor/shared";
import { useApiClient } from "../../../context/AuthContext";

const pad = (value: number) => String(value).padStart(2, "0");

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export default function ClientesAsignadosPage() {
  const api = useApiClient();

  const [driverId, setDriverId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Solo los choferes pueden tener una lista de clientes asignada: mismo
  // filtro que TruckCalendar usa para el selector de camion.
  const { data: users = [] } = useSWR<UserSummary[]>("/users");
  const drivers = users.filter((user) => user.role === "chofer");

  const {
    data: customers = [],
    isLoading: customersLoading,
    error: customersError,
  } = useSWR<CustomerRecord[]>("/customers");

  // La clave solo existe con chofer+dia elegidos: sin eso no hay nada que
  // precargar todavia.
  const existingKey =
    driverId && date
      ? `/driver-customer-assignments?driverId=${driverId}&date=${date}`
      : null;

  const { data: existingAssignments } =
    useSWR<DriverCustomerAssignmentRecord[]>(existingKey);

  // Se precarga una unica vez por combinacion chofer+dia (rastreada por ref,
  // no por estado): si en vez de esto se re-sembrara cada vez que
  // `existingAssignments` cambia de referencia, una revalidacion de SWR en
  // segundo plano pisaria silenciosamente los tildes que el admin todavia no
  // guardo. El ref tambien evita un loop de renders si el objeto que
  // devuelve el fetch cambia de identidad sin cambiar de contenido.
  const seededKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!existingKey) {
      if (seededKeyRef.current !== null) {
        seededKeyRef.current = null;
        setCheckedIds(new Set());
      }
      return;
    }

    if (existingAssignments === undefined) {
      return;
    }

    if (seededKeyRef.current === existingKey) {
      return;
    }

    seededKeyRef.current = existingKey;
    const assignment = existingAssignments[0];
    setCheckedIds(new Set(assignment ? assignment.customers.map((customer) => customer.id) : []));
  }, [existingKey, existingAssignments]);

  const filteredCustomers = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) {
      return customers;
    }
    return customers.filter((customer) => customer.name.toLowerCase().includes(normalized));
  }, [customers, search]);

  const toggleCustomer = (customerId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(customerId)) {
        next.delete(customerId);
      } else {
        next.add(customerId);
      }
      return next;
    });
  };

  const save = async () => {
    if (!driverId || !date) {
      return;
    }

    try {
      setSaving(true);
      setActionError(null);
      setNotice(null);

      // El orden enviado es el orden de la lista completa de clientes, no el
      // orden en que se tildaron: asi el orden guardado es estable sin
      // importar en que secuencia el admin clickeo los checkboxes.
      const customerIds = customers
        .filter((customer) => checkedIds.has(customer.id))
        .map((customer) => customer.id);

      await api.put("/driver-customer-assignments", { driverId, date, customerIds });

      setNotice(`Lista guardada: ${customerIds.length} cliente(s).`);
    } catch {
      setActionError("No se pudo guardar la lista.");
    } finally {
      setSaving(false);
    }
  };

  const canSave = driverId.length > 0 && date.length > 0 && !saving;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-semibold">Clientes asignados</h2>
      <p className="mt-2 text-sm text-slate-600">
        Elegi un chofer y un dia para armar la lista de clientes a visitar.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-600">
          Chofer
          <select
            value={driverId}
            onChange={(event) => setDriverId(event.target.value)}
            className="mt-1 block w-48 rounded border border-slate-300 px-3 py-2"
          >
            <option value="">Elegir chofer</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.username}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-slate-600">
          Dia
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="mt-1 block w-48 rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="text-sm text-slate-600">
          Buscar cliente
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nombre del cliente"
            className="mt-1 block w-64 rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <button
          type="button"
          onClick={() => void save()}
          disabled={!canSave}
          className="h-10 rounded bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {saving ? "Guardando..." : "Guardar lista"}
        </button>
      </div>

      {actionError && <p className="mt-3 text-sm text-rose-700">{actionError}</p>}
      {notice && <p className="mt-3 text-sm text-emerald-700">{notice}</p>}

      {customersLoading && <p className="mt-4 text-slate-600">Cargando clientes...</p>}
      {customersError && (
        <p className="mt-4 text-sm text-rose-700">No se pudo cargar la lista de clientes.</p>
      )}

      {!customersLoading && !customersError && (
        <ul className="mt-4 flex max-h-96 flex-col gap-1 overflow-y-auto">
          {filteredCustomers.length === 0 && (
            <li className="text-sm text-slate-600">Sin clientes que coincidan con la busqueda.</li>
          )}
          {filteredCustomers.map((customer) => (
            <li key={customer.id}>
              <label className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={checkedIds.has(customer.id)}
                  onChange={() => toggleCustomer(customer.id)}
                />
                <span>{customer.name}</span>
                <span className="text-xs text-slate-500">({customer.customerType})</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
