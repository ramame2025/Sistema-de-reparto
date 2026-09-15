import {
  priceSaleItems,
  type CreateSaleInput,
  type PaymentMethod,
  type PaymentMethodRecord,
  type PriceTable,
  type SaleRecord,
} from '@distribuidor/shared';
import type { PendingSale } from './offlineQueue';
import { paymentMethodLabel, proofPolicyOf } from './paymentMethods';

export type SaleProblem = {
  /**
   * `not-sent`: el servidor nunca la recibio, sigue en la cola del telefono.
   * `missing-proof`: esta guardada, pero se cobro con un medio cuya
   * `proofPolicy` no es `none` y no tiene foto del comprobante.
   */
  kind: 'not-sent' | 'missing-proof';
  /** queueId para `not-sent`, id de la venta para `missing-proof`. */
  id: string;
  customerName: string;
  /** Ausente cuando no hay con que valorizarla (sin precios, o una visita). */
  total?: number;
  attempts?: number;
  paymentMethod?: PaymentMethod;
  /**
   * Como se muestra el medio de pago. Viaja resuelto para que la tarjeta que
   * lo pinta no tenga que conocer el catalogo: es un componente de
   * presentacion y recibe texto, no codigos que traducir.
   */
  paymentMethodLabel?: string;
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

  // Un par sin precio cae en el mismo `undefined` que no tener tabla: el
  // contrato de `total` ya dice "ausente cuando no hay con que valorizarla", y
  // un cero aca haria parecer que la venta no valia nada.
  const priced = priceSaleItems(payload.customerType, payload.items, prices);

  return priced.ok ? priced.total : undefined;
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
 * Con `proofPolicy: 'optional'` el comprobante sigue siendo opcional al
 * momento de cobrar -- esto es un aviso al cierre del dia, no una validacion
 * que bloquee la venta. Con `'required'` la venta ni siquiera se pudo guardar
 * sin el, asi que ahi este aviso no tiene a quien avisarle.
 *
 * `paymentMethods` NO tiene default a proposito: sin el, la funcion no puede
 * saber que medio lleva comprobante, y un default silencioso convertiria esa
 * ignorancia en avisos inventados.
 */
export function buildDayProblems(
  pendingSales: PendingSale[],
  todaySales: SaleRecord[],
  prices: PriceTable | null,
  paymentMethods: PaymentMethodRecord[],
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

  // Sin catalogo no hay reglas que aplicar, y NO se inventan: con la lista
  // vacia todo codigo caeria en el default `optional` y cada venta en efectivo
  // del dia apareceria reclamando un comprobante que no existe. Se avisa de lo
  // que si se sabe -- las que no se enviaron -- y nada mas.
  if (paymentMethods.length === 0) {
    return notSent;
  }

  const missingProof: SaleProblem[] = todaySales
    .filter(
      (sale) =>
        sale.status === 'active' &&
        sale.kind === 'sale' &&
        // Una visita sin venta no tiene comprobante que adjuntar
        // (`paymentMethod` es null), y un medio con politica `none` -- el
        // efectivo -- tampoco. Antes esto era la comparacion literal
        // `!== 'efectivo'`; ahora la regla la trae el medio de pago.
        proofPolicyOf(paymentMethods, sale.paymentMethod) !== 'none' &&
        !sale.paymentProofRef,
    )
    .map((sale) => ({
      kind: 'missing-proof',
      id: sale.id,
      customerName: sale.customerName,
      total: sale.total,
      paymentMethod: sale.paymentMethod as PaymentMethod,
      paymentMethodLabel: paymentMethodLabel(
        paymentMethods,
        sale.paymentMethod,
        'venta',
      ),
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
