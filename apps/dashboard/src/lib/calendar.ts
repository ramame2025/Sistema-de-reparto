/** Un dia del calendario de un camion, tal como lo devuelve la API. */
export type EffectiveDay = {
  date: string;
  driverId: string | null;
  assignmentId: string | null;
  kind: "titular" | "cobertura" | null;
};

export type MonthCell = EffectiveDay & { dayOfMonth: number };

/** `null` = celda de relleno: pertenece a otro mes. */
export type MonthGrid = (MonthCell | null)[][];

export type RangeSelection = {
  from: string | null;
  to: string | null;
};

const pad = (value: number) => String(value).padStart(2, "0");

const isoDay = (year: number, month: number, dayOfMonth: number) =>
  `${year}-${pad(month)}-${pad(dayOfMonth)}`;

/**
 * Lunes = 0. `getUTCDay()` devuelve domingo = 0, y arrancar la semana en
 * domingo desalinearia toda la grilla respecto de como se lee un calendario
 * de reparto.
 */
const mondayFirstIndex = (date: Date) => (date.getUTCDay() + 6) % 7;

/**
 * Arma la grilla del mes en semanas de lunes a domingo, con las celdas de
 * relleno en `null`. Las fechas se construyen en UTC: usar fechas locales
 * correria el mes entero segun la zona horaria del navegador.
 */
export function buildMonthGrid(
  year: number,
  month: number,
  effectiveDays: EffectiveDay[],
): MonthGrid {
  const byDate = new Map(effectiveDays.map((day) => [day.date, day]));

  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  // Dia 0 del mes siguiente = ultimo dia de este mes.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const cells: (MonthCell | null)[] = [];

  for (let i = 0; i < mondayFirstIndex(firstOfMonth); i += 1) {
    cells.push(null);
  }

  for (let dayOfMonth = 1; dayOfMonth <= daysInMonth; dayOfMonth += 1) {
    const date = isoDay(year, month, dayOfMonth);
    const effective = byDate.get(date);

    cells.push({
      date,
      dayOfMonth,
      driverId: effective?.driverId ?? null,
      assignmentId: effective?.assignmentId ?? null,
      kind: effective?.kind ?? null,
    });
  }

  // Completa la ultima semana para que todas las filas tengan 7 celdas.
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const grid: MonthGrid = [];
  for (let i = 0; i < cells.length; i += 7) {
    grid.push(cells.slice(i, i + 7));
  }

  return grid;
}

/**
 * Maquina de seleccion por dos clicks: el primero fija el inicio, el segundo
 * cierra el rango. Un segundo click ANTERIOR al inicio reinicia la seleccion
 * en vez de invertir el rango: invertirlo crearia en silencio un rango que
 * nadie pidio, y quien clickea antes es porque se equivoco de dia.
 */
export function selectRange(current: RangeSelection, date: string): RangeSelection {
  const rangeIsOpen = current.from !== null && current.to === null;

  if (!rangeIsOpen) {
    return { from: date, to: null };
  }

  if (date < current.from!) {
    return { from: date, to: null };
  }

  return { from: current.from, to: date };
}

export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const zeroBased = month - 1 + delta;

  return {
    year: year + Math.floor(zeroBased / 12),
    month: ((zeroBased % 12) + 12) % 12 + 1,
  };
}
