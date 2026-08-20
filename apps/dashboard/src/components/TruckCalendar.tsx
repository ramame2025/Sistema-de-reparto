"use client";

import { useState } from "react";
import useSWR from "swr";
import type {
  AssignmentKind,
  CreateAssignmentInput,
  TruckRecord,
  UserSummary,
} from "@distribuidor/shared";
import { useApiClient } from "../context/AuthContext";
import {
  buildMonthGrid,
  selectRange,
  shiftMonth,
  type EffectiveDay,
  type RangeSelection,
} from "../lib/calendar";

type TruckCalendarResponse = {
  truckId: string;
  from: string;
  to: string;
  assignments: {
    id: string;
    driverId: string;
    kind: AssignmentKind;
    startDate: string;
    endDate: string | null;
  }[];
  days: EffectiveDay[];
};

type AssignmentWarning = { code: string; message: string };

const WEEKDAYS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const pad = (value: number) => String(value).padStart(2, "0");

const monthBounds = (year: number, month: number) => ({
  from: `${year}-${pad(month)}-01`,
  to: `${year}-${pad(month)}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`,
});

const EMPTY_RANGE: RangeSelection = { from: null, to: null };

export function TruckCalendar({ truck }: { truck: TruckRecord }) {
  const api = useApiClient();
  const today = new Date();

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [range, setRange] = useState<RangeSelection>(EMPTY_RANGE);
  const [driverId, setDriverId] = useState("");
  const [kind, setKind] = useState<AssignmentKind>("cobertura");
  const [warnings, setWarnings] = useState<AssignmentWarning[]>([]);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { from, to } = monthBounds(year, month);

  const {
    data: calendar,
    isLoading,
    error: loadError,
    mutate: reloadCalendar,
  } = useSWR<TruckCalendarResponse>(`/trucks/${truck.id}/calendar?from=${from}&to=${to}`);

  // Solo los choferes pueden manejar un camion: los admin no se ofrecen.
  const { data: users = [] } = useSWR<UserSummary[]>("/users");
  const drivers = users.filter((user) => user.role === "chofer");

  const driverName = (id: string | null) =>
    id ? (drivers.find((driver) => driver.id === id)?.username ?? id.slice(0, 6)) : null;

  const grid = buildMonthGrid(year, month, calendar?.days ?? []);
  const rangeIsClosed = range.from !== null && range.to !== null;

  const inSelection = (date: string) =>
    range.from !== null &&
    date >= range.from &&
    date <= (range.to ?? range.from);

  const goToMonth = (delta: number) => {
    const next = shiftMonth(year, month, delta);
    setYear(next.year);
    setMonth(next.month);
    setRange(EMPTY_RANGE);
    setWarnings([]);
  };

  const clickDay = async (date: string) => {
    const next = selectRange(range, date);
    setRange(next);
    setWarnings([]);
    setActionError(null);
    setNotice(null);

    // Al cerrar el rango se consulta el ensayo: el aviso cruzado tiene que
    // verse ANTES de confirmar, no despues de haber creado la asignacion.
    if (next.from && next.to && driverId) {
      await loadWarnings(next.from, next.to);
    }
  };

  const loadWarnings = async (rangeFrom: string, rangeTo: string) => {
    try {
      const payload: CreateAssignmentInput = {
        driverId,
        truckId: truck.id,
        kind,
        startDate: rangeFrom,
        ...(kind === "cobertura" ? { endDate: rangeTo } : {}),
      };
      setWarnings(await api.post<AssignmentWarning[]>("/driver-truck-assignments/preview", payload));
    } catch {
      // El ensayo es informativo: si falla no bloquea, solo no muestra avisos.
      setWarnings([]);
    }
  };

  const assign = async () => {
    if (!driverId || !range.from) {
      return;
    }

    try {
      setSaving(true);
      setActionError(null);
      setNotice(null);

      const payload: CreateAssignmentInput = {
        driverId,
        truckId: truck.id,
        kind,
        startDate: range.from,
        // Un titular puede quedar abierto ("de aca en adelante"); una cobertura
        // siempre lleva fin, que es lo que la vuelve una cobertura.
        ...(kind === "cobertura" ? { endDate: range.to ?? range.from } : {}),
      };

      await api.post("/driver-truck-assignments", payload);

      setNotice(
        kind === "titular"
          ? `${driverName(driverId)} queda como titular desde el ${range.from}.`
          : `${driverName(driverId)} cubre del ${range.from} al ${range.to ?? range.from}.`,
      );
      setRange(EMPTY_RANGE);
      setWarnings([]);
      await reloadCalendar();
    } catch {
      setActionError(
        "No se pudo asignar. Puede haber otra asignacion del mismo tipo pisando esos dias.",
      );
    } finally {
      setSaving(false);
    }
  };

  const closeAssignment = async (assignmentId: string, endDate: string) => {
    if (!window.confirm(`Terminar esta asignacion el ${endDate}?`)) {
      return;
    }

    try {
      setActionError(null);
      setNotice(null);
      await api.patch(`/driver-truck-assignments/${assignmentId}/close`, { endDate });
      setNotice("Asignacion cerrada.");
      await reloadCalendar();
    } catch {
      setActionError("No se pudo cerrar la asignacion.");
    }
  };

  const canAssign =
    driverId.length > 0 && range.from !== null && (kind === "titular" || rangeIsClosed);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Calendario · {truck.code}</h2>
          <p className="text-sm text-slate-600">
            {truck.plate} · capacidad {truck.capacity}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goToMonth(-1)}
            className="rounded bg-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-300"
          >
            ‹
          </button>
          <span className="min-w-40 text-center font-medium">
            {MONTHS[month - 1]} {year}
          </span>
          <button
            type="button"
            onClick={() => goToMonth(1)}
            className="rounded bg-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-300"
          >
            ›
          </button>
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-600">
        Clickea el dia de inicio y despues el de fin. Un segundo click antes del
        inicio reinicia la seleccion.
      </p>

      {isLoading && <p className="mt-4 text-slate-600">Cargando calendario...</p>}
      {loadError && (
        <p className="mt-4 text-sm text-rose-700">No se pudo cargar el calendario.</p>
      )}

      {!isLoading && !loadError && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-center text-sm">
            <thead>
              <tr className="text-slate-500">
                {WEEKDAYS.map((weekday) => (
                  <th key={weekday} className="py-2 font-medium">
                    {weekday}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((week, weekIndex) => (
                <tr key={weekIndex}>
                  {week.map((cell, cellIndex) => {
                    if (!cell) {
                      return <td key={cellIndex} className="p-1" />;
                    }

                    const selected = inSelection(cell.date);
                    const tone = selected
                      ? "bg-sky-700 text-white"
                      : cell.kind === "cobertura"
                        ? "bg-amber-100 text-amber-900"
                        : cell.kind === "titular"
                          ? "bg-emerald-50 text-emerald-900"
                          : "bg-slate-50 text-slate-400";

                    return (
                      <td key={cellIndex} className="p-1 align-top">
                        <button
                          type="button"
                          onClick={() => void clickDay(cell.date)}
                          className={`h-16 w-full rounded border border-slate-200 px-1 py-1 text-left ${tone}`}
                        >
                          <span className="block text-xs font-semibold">
                            {cell.dayOfMonth}
                          </span>
                          <span className="block truncate text-xs">
                            {driverName(cell.driverId) ?? "—"}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 p-4">
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
          Tipo
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as AssignmentKind)}
            className="mt-1 block w-48 rounded border border-slate-300 px-3 py-2"
          >
            <option value="cobertura">Cobertura (dias puntuales)</option>
            <option value="titular">Titular (de aca en adelante)</option>
          </select>
        </label>

        <p className="text-sm text-slate-600">
          {range.from === null
            ? "Sin dias seleccionados"
            : range.to === null
              ? `Desde ${range.from} · elegi el dia de fin`
              : `Del ${range.from} al ${range.to}`}
        </p>

        <button
          type="button"
          onClick={() => void assign()}
          disabled={!canAssign || saving}
          className="h-10 rounded bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {saving ? "Asignando..." : "Asignar"}
        </button>

        {range.from !== null && (
          <button
            type="button"
            onClick={() => {
              setRange(EMPTY_RANGE);
              setWarnings([]);
            }}
            className="h-10 rounded bg-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-300"
          >
            Limpiar
          </button>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3">
          {warnings.map((warning) => (
            <p key={warning.code + warning.message} className="text-sm text-amber-900">
              ⚠ {warning.message}
            </p>
          ))}
        </div>
      )}

      {actionError && <p className="mt-3 text-sm text-rose-700">{actionError}</p>}
      {notice && <p className="mt-3 text-sm text-emerald-700">{notice}</p>}

      {calendar && calendar.assignments.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold">Asignaciones del mes</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {calendar.assignments.map((assignment) => (
              <li
                key={assignment.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 px-3 py-2 text-sm"
              >
                <span>
                  <strong>{driverName(assignment.driverId)}</strong> · {assignment.kind} ·{" "}
                  {assignment.startDate.slice(0, 10)} →{" "}
                  {assignment.endDate ? assignment.endDate.slice(0, 10) : "sin fin"}
                </span>
                {assignment.endDate === null && (
                  <button
                    type="button"
                    onClick={() =>
                      void closeAssignment(
                        assignment.id,
                        range.from ?? new Date().toISOString().slice(0, 10),
                      )
                    }
                    className="rounded bg-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-300"
                  >
                    Terminar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
