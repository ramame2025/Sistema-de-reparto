export type CsvCell = string | number | null | undefined;

const escapeCsvCell = (value: CsvCell) => {
  const raw = String(value ?? "");
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replaceAll("\"", "\"\"")}"`;
  }

  return raw;
};

export const toCsv = (headers: string[], rows: CsvCell[][]) => {
  const headerLine = headers.map((cell) => escapeCsvCell(cell)).join(",");
  const lines = rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(","));
  return [headerLine, ...lines].join("\n");
};

const formatDateForFilename = (value: string) => value.replaceAll("-", "");

/** Describe el rango filtrado para que el nombre del archivo sea autoexplicativo. */
const buildDateRangeLabel = (from: string, to: string) => {
  if (from && to) {
    return from === to ? from : `${from}_to_${to}`;
  }

  if (from) {
    return `${from}_onward`;
  }

  if (to) {
    return `until_${to}`;
  }

  return new Date().toISOString().slice(0, 10);
};

const triggerCsvDownload = (filename: string, csvContent: string) => {
  // El BOM hace que Excel abra el archivo en UTF-8 sin romper los acentos.
  const blob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

type CsvReport = {
  prefix: string;
  from: string;
  to: string;
  headers: string[];
  rows: CsvCell[][];
};

/** Arma el CSV, le pone nombre segun el rango filtrado y dispara la descarga. */
export const downloadCsvReport = ({ prefix, from, to, headers, rows }: CsvReport) => {
  const label = buildDateRangeLabel(from, to);
  triggerCsvDownload(
    `${prefix}_${formatDateForFilename(label)}.csv`,
    toCsv(headers, rows),
  );
};
