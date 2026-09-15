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
 * Si un codigo deja al cliente debiendo, segun el catalogo cacheado.
 *
 * La pregunta se hace SIEMPRE por la bandera, nunca comparando el codigo
 * contra 'cuenta_corriente'. Ese string comparado a mano es el mismo defecto
 * que la tabla de medios de pago vino a borrar cuando habia tres copias de
 * `!== 'efectivo'`; el dia que el duenio agregue "fiado a 30 dias" alcanza con
 * una fila nueva y no hay una sola linea de esta app que tocar.
 *
 * El default para un codigo desconocido es `false`, y ahi se separa de
 * `proofPolicyOf`: un medio que no esta en el catalogo deja la bandera
 * DESCONOCIDA, y suponer deuda bloquearia una venta ya cobrada en la calle por
 * una regla que este lado no puede verificar. El servidor la comprueba contra
 * la tabla. Mismo criterio que `createsDebtFor` en packages/shared.
 */
export function createsDebtOf(
  methods: PaymentMethodRecord[],
  code: PaymentMethod | null | undefined,
): boolean {
  if (!code) {
    return false;
  }

  return methods.find((method) => method.code === code)?.createsDebt ?? false;
}

/**
 * Lo que devuelve `validateCreateSaleInput` cuando un medio que genera deuda
 * viene sin cliente del padron. Vive aca, en un solo lugar, para que las
 * pantallas no lo repitan cada una por su cuenta.
 */
const DEBTOR_REQUIRED_ERROR =
  'customerId is required when the payment method creates debt';

/**
 * Traduce un error del validador compartido al idioma del chofer.
 *
 * El validador habla en ingles y para el servidor: "customerId is required"
 * no dice ni el motivo ni que hacer. El chofer necesita las dos cosas, y con
 * el nombre del medio que eligio -- no con el de una fila que no sabe que
 * existe.
 *
 * `whatToDo` cambia segun la pantalla: en una venta nueva el chofer puede
 * elegir el cliente ahi mismo; en una venta ya grabada no.
 *
 * Cualquier otro error pasa tal cual, a proposito: traducir a ciegas todo lo
 * que devuelva el validador esconderia un motivo nuevo detras de una frase
 * vieja.
 */
export function driverErrorMessage(
  error: string,
  methodName: string,
  whatToDo: string,
): string {
  if (error === DEBTOR_REQUIRED_ERROR) {
    return `${methodName} queda como deuda del cliente: ${whatToDo}`;
  }

  return error;
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
