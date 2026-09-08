const pad = (value: number) => String(value).padStart(2, "0");

/** `Date` -> `YYYY-MM-DD` en horario local (no UTC), el formato que espera `<input type="date">`. */
export const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Hoy, en fecha local. */
export const todayIsoDate = () => toIsoDate(new Date());

/** `days` atras respecto de hoy, en fecha local. */
export const isoDateDaysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toIsoDate(date);
};
