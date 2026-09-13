import type { PaymentMethodRecord, PaymentMethod, ProofPolicy } from '@distribuidor/shared';

/**
 * Una unica definicion de como se lee y como se comporta un medio de pago.
 *
 * Antes habia cuatro copias de las etiquetas (NewSaleScreen, SaleDetailScreen,
 * SaleResultScreen, DayStatusCard) y tres copias de la regla de comprobante,
 * escritas como `!== 'efectivo'`. Las etiquetas y la regla ahora salen de la
 * tabla; esto es solo el acceso.
 */

/**
 * Que politica de comprobante aplica un codigo, segun el catalogo cacheado.
 *
 * El default para un codigo desconocido es `optional`, y es una eleccion
 * deliberada: un medio que ya no esta en el catalogo activo (se dio de baja
 * despues de la venta) se sigue tratando como "podria tener comprobante", que
 * es exactamente lo que hacia el viejo `!== 'efectivo'`. Asumir `none`
 * silenciaria un comprobante faltante de verdad.
 */
export function proofPolicyOf(
  methods: PaymentMethodRecord[],
  code: PaymentMethod | null | undefined,
): ProofPolicy {
  if (!code) {
    return 'none';
  }

  return methods.find((method) => method.code === code)?.proofPolicy ?? 'optional';
}

/**
 * Como se muestra un medio de pago.
 *
 * Cae al codigo crudo si no esta en el catalogo: es feo a proposito. Un medio
 * dado de baja que aparece en una venta vieja tiene que poder leerse, y un
 * codigo visible es una pista de que falta sincronizar, no un error mudo.
 */
export function paymentMethodLabel(
  methods: PaymentMethodRecord[],
  code: PaymentMethod | null | undefined,
  fallback = 'Sin pago',
): string {
  if (!code) {
    return fallback;
  }

  return methods.find((method) => method.code === code)?.name ?? code;
}
