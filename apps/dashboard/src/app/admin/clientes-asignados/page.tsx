"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import type {
  CustomerRecord,
  DriverCustomerAssignmentHistoryResponse,
  DriverCustomerAssignmentRecord,
  UserSummary,
} from "@distribuidor/shared";
import { useApiClient } from "../../../context/AuthContext";

const pad = (value: number) => String(value).padStart(2, "0");

const toIso = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const todayIso = () => toIso(new Date());

/** `days` atras respecto de hoy, en fecha local (no UTC). */
const isoDaysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toIso(date);
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
    <div className="flex flex-col gap-6">
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

      <AssignmentHistory drivers={drivers} customers={customers} />
    </div>
  );
}

type AssignmentHistoryProps = {
  drivers: UserSummary[];
  customers: CustomerRecord[];
};

/**
 * Historial paginado (15 por pagina) de todas las listas armadas, filtrable
 * por chofer, rango de fechas y cliente incluido en la lista. La paginacion y
 * el filtrado viven en el servidor (`GET /driver-customer-assignments/history`):
 * el historial crece un row por chofer por dia, traerlo entero al browser no
 * escalaria.
 */
function AssignmentHistory({ drivers, customers }: AssignmentHistoryProps) {
  const [filterDriverId, setFilterDriverId] = useState("");
  // Por defecto, la ultima semana: el caso comun es "que asigne esta semana",
  // no todo el historico.
  const [from, setFrom] = useState(() => isoDaysAgo(7));
  const [to, setTo] = useState(() => todayIso());
  const [filterCustomerId, setFilterCustomerId] = useState("");
  const [page, setPage] = useState(1);

  // Cualquier cambio de filtro vuelve a la primera pagina: quedarse en la
  // pagina 7 de un resultado que ahora tiene 2 paginas mostraria vacio.
  const applyFilter =
    (setter: (value: string) => void) => (value: string) => {
      setter(value);
      setPage(1);
    };

  const historyKey = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    if (filterDriverId) params.set("driverId", filterDriverId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (filterCustomerId) params.set("customerId", filterCustomerId);
    return `/driver-customer-assignments/history?${params.toString()}`;
  }, [page, filterDriverId, from, to, filterCustomerId]);

  const { data, isLoading, error } =
    useSWR<DriverCustomerAssignmentHistoryResponse>(historyKey);

  const driverNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const driver of drivers) {
      map.set(driver.id, driver.username);
    }
    return map;
  }, [drivers]);

  const items = data?.items ?? [];
  const currentPage = data?.page ?? page;
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-semibold">Historial de asignaciones</h2>
      <p className="mt-2 text-sm text-slate-600">
        Todas las listas armadas, 15 por pagina. Filtra por chofer, fechas o cliente.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-600">
          Filtrar por chofer
          <select
            value={filterDriverId}
            onChange={(event) => applyFilter(setFilterDriverId)(event.target.value)}
            className="mt-1 block w-48 rounded border border-slate-300 px-3 py-2"
          >
            <option value="">Todos</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.username}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-slate-600">
          Desde
          <input
            type="date"
            value={from}
            onChange={(event) => applyFilter(setFrom)(event.target.value)}
            className="mt-1 block w-44 rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="text-sm text-slate-600">
          Hasta
          <input
            type="date"
            value={to}
            onChange={(event) => applyFilter(setTo)(event.target.value)}
            className="mt-1 block w-44 rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="text-sm text-slate-600">
          Filtrar por cliente
          <select
            value={filterCustomerId}
            onChange={(event) => applyFilter(setFilterCustomerId)(event.target.value)}
            className="mt-1 block w-56 rounded border border-slate-300 px-3 py-2"
          >
            <option value="">Todos</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className="mt-4 text-sm text-rose-700">No se pudo cargar el historial.</p>
      )}
      {isLoading && !data && <p className="mt-4 text-slate-600">Cargando historial...</p>}

      {!error && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-4">Fecha</th>
                <th className="py-2 pr-4">Chofer</th>
                <th className="py-2 pr-4">Clientes</th>
                <th className="py-2 pr-4">Lista</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-slate-600">
                    Sin asignaciones en el historial.
                  </td>
                </tr>
              )}
              {items.map((assignment) => (
                <tr key={assignment.id} className="border-b border-slate-100 align-top">
                  <td className="py-2 pr-4 whitespace-nowrap">{assignment.date}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {driverNameById.get(assignment.driverId) ?? assignment.driverId}
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">{assignment.customers.length}</td>
                  <td className="py-2 pr-4 text-slate-600">
                    {assignment.customers.map((customer) => customer.name).join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3 text-sm text-slate-600">
        <button
          type="button"
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          disabled={currentPage <= 1}
          className="rounded border border-slate-300 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Anterior
        </button>
        <span>
          Pagina {currentPage} de {totalPages} ({total} en total)
        </span>
        <button
          type="button"
          onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          disabled={currentPage >= totalPages}
          className="rounded border border-slate-300 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Siguiente
        </button>
      </div>
    </section>
  );
}
