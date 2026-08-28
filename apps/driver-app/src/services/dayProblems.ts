import {
  calculateSaleTotal,
  type CreateSaleInput,
  type PaymentMethod,
  type PriceTable,
  type SaleRecord,
} from '@distribuidor/shared';
import type { PendingSale } from './offlineQueue';

export type SaleProblem = {
  /**
   * `not-sent`: el servidor nunca la recibio, sigue en la cola del telefono.
   * `missing-proof`: esta guardada, pero se cobro sin efectivo y no tiene foto
   * del comprobante.
   */
  kind: 'not-sent' | 'missing-proof';
  /** queueId para `not-sent`, id de la venta para `missing-proof`. */
  id: string;
  customerName: string;
  /** Ausente cuando no hay con que valorizarla (sin precios, o una visita). */
  total?: number;
  attempts?: number;
  paymentMethod?: PaymentMethod;
};

/**
 * Mismo criterio de "hoy" que usa `SyncContext.refreshDaySummary`: se compara
 * la parte de fecha de `createdAt`, sin filtro server-side.
 */
export function todaySalesOf(sales: SaleRecord[], today: string): SaleRecord[] {
  return sales.filter((sale) => sale.createdAt.slice(0, 10) === today);
}

const totalOfQueued = (entry: PendingSale, prices: PriceTable | null): number | undefined => {
  if (!prices || entry.kind === 'churn' || !entry.payload) {
    return undefined;
  }

  const payload = entry.payload as CreateSaleInput;
  if (!payload.items || payload.items.length === 0) {
    return undefined;
  }

  return calculateSaleTotal(payload.customerType, payload.items, prices);
};

/**
 * Lo que el chofer tiene que resolver antes de cerrar el dia, en un solo
 * listado y en orden de urgencia.
 *
 * El orden no es arbitrario: una venta que el servidor nunca recibio se pierde
 * entera si el telefono se rompe o se reinstala la app, mientras que una sin
 * comprobante ya esta guardada y solo le falta un adjunto. Primero lo que se
 * puede perder.
 *
 * El comprobante sigue siendo opcional al momento de cobrar -- esto es un
 * aviso al cierre del dia, no una validacion que bloquee la venta.
 */
export function buildDayProblems(
  pendingSales: PendingSale[],
  todaySales: SaleRecord[],
  prices: PriceTable | null,
): SaleProblem[] {
  // La cola se restaura desde el almacenamiento del telefono, asi que una
  // entrada puede llegar incompleta (version vieja de la app, escritura
  // cortada). Inicio es la primera pantalla que el chofer abre: una entrada
  // rota no puede dejarlo sin portada, asi que se muestra sin nombre en vez de
  // romper el render.
  const notSent: SaleProblem[] = pendingSales.map((entry) => ({
    kind: 'not-sent',
    id: entry.queueId,
    customerName: entry.payload?.customerName ?? 'Venta sin datos',
    ...(totalOfQueued(entry, prices) !== undefined
      ? { total: totalOfQueued(entry, prices) }
      : {}),
    attempts: entry.retries,
  }));

  const missingProof: SaleProblem[] = todaySales
    .filter(
      (sale) =>
        sale.status === 'active' &&
        sale.kind === 'sale' &&
        // Una visita sin venta y una venta en efectivo no tienen comprobante
        // que adjuntar: `paymentMethod` es null en la primera.
        sale.paymentMethod !== null &&
        sale.paymentMethod !== 'efectivo' &&
        !sale.paymentProofRef,
    )
    .map((sale) => ({
      kind: 'missing-proof',
      id: sale.id,
      customerName: sale.customerName,
      total: sale.total,
      paymentMethod: sale.paymentMethod as PaymentMethod,
    }));

  return [...notSent, ...missingProof];
}

/**
 * Cuantos de los clientes asignados de hoy ya fueron visitados, contando una
 * visita sin venta como visita: el chofer fue igual.
 *
 * Se apoya en `SaleRecord.customerId`, que la API expone desde el arreglo del
 * vinculo cliente-venta. Una venta cargada con un cliente que no esta en la
 * asignacion de hoy no suma: la pregunta es cuanto queda del recorrido
 * planificado, no cuantas ventas se hicieron.
 */
export function countVisitedCustomers(
  assignedCustomerIds: string[],
  todaySales: SaleRecord[],
): number {
  const visited = new Set(
    todaySales
      .filter((sale) => sale.status === 'active' && sale.customerId)
      .map((sale) => sale.customerId as string),
  );

  return assignedCustomerIds.filter((id) => visited.has(id)).length;
}
