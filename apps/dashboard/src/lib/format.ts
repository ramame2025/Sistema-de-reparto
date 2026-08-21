import type { PaymentMethod } from "@distribuidor/shared";

/**
 * Una venta de tipo "churn" (visita sin venta, container-visit-recording)
 * se persiste con `paymentMethod: null` -- no hubo pago, es el hecho de
 * negocio real, no un dato faltante. Mostrar `null` crudo en una tabla o un
 * CSV se lee como un dato roto; este helper lo vuelve explicito.
 */
export const formatPaymentMethod = (paymentMethod: PaymentMethod | null): string =>
  paymentMethod ?? "Sin pago";
