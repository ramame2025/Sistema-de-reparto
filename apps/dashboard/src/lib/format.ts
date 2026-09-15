import type {
  PaymentMethod,
  PaymentMethodRecord,
  ReturnReason,
  SaleKind,
  SaleReturnItemRecord,
  TruckCapacityEntry,
} from "@distribuidor/shared";

/**
 * Una venta de tipo "churn" (visita sin venta, container-visit-recording)
 * se persiste con `paymentMethod: null` -- no hubo pago, es el hecho de
 * negocio real, no un dato faltante. Mostrar `null` crudo en una tabla o un
 * CSV se lee como un dato roto; este helper lo vuelve explicito.
 */
/**
 * Sin la lista de medios solo se puede mostrar el codigo crudo, que es como se
 * mostraba hasta ahora: la tabla decia literalmente "qr". Con la lista se
 * muestra el nombre, y el codigo queda como ultimo recurso para un medio que
 * ya no esta -- visible a proposito, para que se note que falta.
 */
export const formatPaymentMethod = (
  paymentMethod: PaymentMethod | null,
  paymentMethods: PaymentMethodRecord[] = [],
): string => {
  if (!paymentMethod) {
    return "Sin pago";
  }

  return (
    paymentMethods.find((method) => method.code === paymentMethod)?.name ??
    paymentMethod
  );
};

/**
 * La capacidad del camion en una linea. Una grilla vacia se lee "sin
 * detallar" y NUNCA 0: nadie la cargo todavia, que no es lo mismo que decir
 * que el camion no lleva nada. Un producto declarado en 0, en cambio, si es
 * una respuesta cargada y se muestra.
 */
export const formatTruckCapacities = (capacities: TruckCapacityEntry[]): string =>
  capacities.length === 0
    ? "sin detallar"
    : capacities.map((entry) => `${entry.productCode} ${entry.units}`).join(" · ");

/**
 * Como se lee cada clase de fila en el panel. Los tres valores son hechos de
 * negocio distintos y tienen que verse distintos: un cambio que se muestra
 * como una venta de $0 no se entiende, y lo primero que hace quien lo ve es
 * desconfiar del numero.
 *
 * - `Venta`: se vendio algo, con o sin devoluciones ni cambios en la misma
 *   visita. Es la unica clase que cobra.
 * - `Visita`: solo volvieron envases vacios. No se entrego nada.
 * - `Cambio`: solo se cambiaron unidades falladas por otras de reemplazo, sin
 *   cargo.
 */
export const SALE_KIND_LABELS: Record<SaleKind, string> = {
  sale: "Venta",
  churn: "Visita",
  swap: "Cambio",
};

/**
 * Una fila sin `kind` se lee como venta: es lo que era. Los cambios y las
 * devoluciones con cantidades no existian cuando se grabo.
 */
export const formatSaleKind = (kind: SaleKind | undefined): string =>
  SALE_KIND_LABELS[kind ?? "sale"] ?? SALE_KIND_LABELS.sale;

/**
 * Por que volvio una unidad, en castellano llano. Sin esto el reporte dice
 * "empty" y "faulty", y un reporte que hay que traducir mentalmente no lo usa
 * nadie.
 */
export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  empty: "Envase vacio",
  faulty: "Unidad fallada",
};

export const formatReturnReason = (reason: ReturnReason): string =>
  RETURN_REASON_LABELS[reason] ?? reason;

/**
 * Lo que volvio en una visita, en una linea, para la tabla y el CSV. Vacio
 * cuando no volvio nada -- incluida una venta vieja que no trae la lista.
 */
export const formatReturnItems = (
  returnItems: SaleReturnItemRecord[] | undefined,
): string =>
  (returnItems ?? [])
    .map((item) => `${item.productCode}x${item.quantity} (${formatReturnReason(item.reason)})`)
    .join(" | ");
