import type {
  PaymentMethod,
  PaymentMethodRecord,
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
