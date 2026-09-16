import type { ProductCode, ReturnReason, SaleRecord } from "@distribuidor/shared";

/** Lo que volvio de un producto, abierto por motivo. */
export type ReturnsByProduct = {
  productCode: ProductCode;
  /** Envases vacios que el cliente devolvio sin recibir nada a cambio. */
  empty: number;
  /** Unidades con falla que se retiraron y se cambiaron por una de reemplazo. */
  faulty: number;
  /** Unidades que volvieron por cualquiera de los dos motivos. */
  total: number;
};

export type ReturnsSummary = {
  products: ReturnsByProduct[];
  totalEmpty: number;
  totalFaulty: number;
  total: number;
  /** Cuantas visitas activas trajeron al menos una linea de vuelta. */
  visitsWithReturns: number;
};

/** Rango de dias calendario, en `YYYY-MM-DD`. Un extremo vacio no acota. */
export type DateRange = {
  from: string;
  to: string;
};

/**
 * En que dia calendario volvio la mercaderia.
 *
 * Se mira `occurredAt` y no `createdAt` a proposito: una visita sin senal se
 * sincroniza dias despues, y el envase volvio el dia de la visita, no el dia
 * en que el telefono consiguio conectarse. `createdAt` queda como respaldo
 * para una fila que no traiga `occurredAt`, que es lo que pasa con los
 * payloads viejos.
 */
const dayOf = (sale: SaleRecord): string => (sale.occurredAt ?? sale.createdAt).slice(0, 10);

const withinRange = (sale: SaleRecord, { from, to }: DateRange): boolean => {
  const day = dayOf(sale);

  if (from && day < from) {
    return false;
  }

  if (to && day > to) {
    return false;
  }

  return true;
};

/**
 * Que volvio de la calle, por producto y por motivo, en un rango de dias.
 *
 * Es el informe que justifica el cambio de envases: sin el, los vacios y las
 * falladas quedan guardados fila por fila y nadie los mira juntos.
 *
 * **Cuenta UNIDADES, no plata, y eso no es un agujero.** Una unidad de
 * reemplazo sale del camion con `unitPrice: 0`, y ese cero es su importe real
 * (D5 del plan `container-swap.md`), no un dato faltante que haya que rellenar
 * con el precio de lista. Valorizar lo que se entrego sin cargo inventaria una
 * facturacion que nunca existio.
 *
 * Las ventas anuladas quedan afuera, igual que en `summarize` y en
 * `summarizeReceivables`: si la fila se anulo, lo que dice que volvio tampoco
 * ocurrio, y contarlo le reclamaria al proveedor una fallada que nadie retiro.
 *
 * `returnItems` es opcional en el tipo porque una venta anterior a este cambio
 * no lo trae. Su ausencia significa "no volvio nada", que es la verdad de toda
 * fila vieja: el dato no se recolectaba (D9).
 */
export function summarizeReturns(
  sales: SaleRecord[],
  range: DateRange,
): ReturnsSummary {
  const byProduct = new Map<ProductCode, ReturnsByProduct>();
  let visitsWithReturns = 0;

  for (const sale of sales) {
    if (sale.status !== "active" || !withinRange(sale, range)) {
      continue;
    }

    const returnItems = sale.returnItems ?? [];
    if (returnItems.length === 0) {
      continue;
    }

    visitsWithReturns += 1;

    for (const line of returnItems) {
      const row = byProduct.get(line.productCode) ?? {
        productCode: line.productCode,
        empty: 0,
        faulty: 0,
        total: 0,
      };

      // El motivo se lee de la linea y nunca se infiere del `kind` de la
      // venta: una visita mixta es `kind: 'sale'` y aun asi puede traer un
      // vacio y una fallada a la vez.
      const reason: ReturnReason = line.reason;
      row[reason] += line.quantity;
      row.total += line.quantity;

      byProduct.set(line.productCode, row);
    }
  }

  const products = [...byProduct.values()].sort((a, b) => {
    if (b.total !== a.total) {
      return b.total - a.total;
    }
    return a.productCode.localeCompare(b.productCode, "es");
  });

  return {
    products,
    totalEmpty: products.reduce((acc, row) => acc + row.empty, 0),
    totalFaulty: products.reduce((acc, row) => acc + row.faulty, 0),
    total: products.reduce((acc, row) => acc + row.total, 0),
    visitsWithReturns,
  };
}
