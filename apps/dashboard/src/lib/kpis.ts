import type { ExpenseRecord, SaleRecord } from "@distribuidor/shared";

export type Summary = {
  facturado: number;
  gastos: number;
  neto: number;
  ventasActivas: number;
  ventasHoy: number;
  facturadoHoy: number;
};

const sum = <T>(items: T[], pick: (item: T) => number) =>
  items.reduce((acc, item) => acc + pick(item), 0);

/**
 * Indicadores de la portada. `today` se pasa como `YYYY-MM-DD` en vez de
 * leerlo acá adentro para que la función sea determinista y testeable.
 *
 * Las ventas anuladas quedan afuera de todo: una venta anulada nunca facturó,
 * y contarla infla los numeros de los que se toman decisiones.
 */
export function summarize(
  sales: SaleRecord[],
  expenses: ExpenseRecord[],
  today: string,
): Summary {
  const active = sales.filter((sale) => sale.status === "active");
  const activeToday = active.filter((sale) => sale.createdAt.slice(0, 10) === today);

  const facturado = sum(active, (sale) => sale.total);
  const gastos = sum(expenses, (expense) => expense.amount);

  return {
    facturado,
    gastos,
    // Puede ser negativo a proposito: un periodo con mas gastos que ventas es
    // informacion, no un error a esconder.
    neto: facturado - gastos,
    ventasActivas: active.length,
    ventasHoy: activeToday.length,
    facturadoHoy: sum(activeToday, (sale) => sale.total),
  };
}
