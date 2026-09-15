import type { ExpenseRecord, SaleRecord } from "@distribuidor/shared";

export type Summary = {
  facturado: number;
  gastos: number;
  neto: number;
  ventasActivas: number;
  ventasHoy: number;
  facturadoHoy: number;
  /**
   * Visitas que se atendieron sin vender: cambios por falla (`swap`) y
   * devoluciones de envase (`churn`). Van aparte de las ventas, no dentro.
   */
  visitasAtendidas: number;
  visitasHoy: number;
};

const sum = <T>(items: T[], pick: (item: T) => number) =>
  items.reduce((acc, item) => acc + pick(item), 0);

/**
 * Si la fila cuenta como VENTA en los conteos de ventas.
 *
 * Respuesta a la pregunta A del plan `container-swap.md`: un cambio por falla
 * y una devolucion de envase NO son ventas. Se atendio al cliente y no se
 * cobro nada; contarlas como ventas de $0 bajaria el ticket promedio de
 * cualquier lectura futura sin que se note por que. Es la misma decision que
 * ya estaba tomada de hecho con el churn.
 *
 * REVERSIBLE EN UNA LINEA: si el duenio prefiere lo contrario, devolver
 * siempre `true` aca alcanza para que un swap y un churn vuelvan a contarse
 * como ventas (y `visitasAtendidas` quede en cero).
 *
 * Una fila sin `kind` cuenta como venta: es lo que era: los cambios y las
 * devoluciones no existian cuando se grabo.
 */
const countsAsSale = (sale: SaleRecord): boolean => (sale.kind ?? "sale") === "sale";

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

  // `facturado` no necesita separar nada: un swap y un churn se graban con
  // `total: 0`, asi que ya no suman un peso (D4/D10). Lo que si hay que
  // separar son los CONTEOS, que cuentan filas y no plata.
  const soldRows = active.filter(countsAsSale);
  const soldRowsToday = activeToday.filter(countsAsSale);

  return {
    facturado,
    gastos,
    // Puede ser negativo a proposito: un periodo con mas gastos que ventas es
    // informacion, no un error a esconder.
    neto: facturado - gastos,
    ventasActivas: soldRows.length,
    ventasHoy: soldRowsToday.length,
    facturadoHoy: sum(activeToday, (sale) => sale.total),
    visitasAtendidas: active.length - soldRows.length,
    visitasHoy: activeToday.length - soldRowsToday.length,
  };
}
