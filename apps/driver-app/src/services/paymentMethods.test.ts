import type { PaymentMethodRecord } from '@distribuidor/shared';
import {
  createsDebtOf,
  driverErrorMessage,
  paymentMethodLabel,
  proofPolicyOf,
} from './paymentMethods';

const buildMethod = (
  overrides: Partial<PaymentMethodRecord> = {},
): PaymentMethodRecord => ({
  id: 'pm-1',
  code: 'efectivo',
  name: 'Efectivo',
  isActive: true,
  sortOrder: 0,
  proofPolicy: 'none',
  countsAsCash: true,
  createsDebt: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const methods = [
  buildMethod(),
  buildMethod({
    id: 'pm-2',
    code: 'transferencia',
    name: 'Transferencia',
    proofPolicy: 'optional',
    countsAsCash: false,
    sortOrder: 1,
  }),
  buildMethod({
    id: 'pm-3',
    code: 'cheque',
    name: 'Cheque',
    proofPolicy: 'required',
    countsAsCash: false,
    sortOrder: 2,
  }),
  buildMethod({
    id: 'pm-4',
    code: 'cuenta_corriente',
    name: 'Cuenta corriente',
    proofPolicy: 'none',
    countsAsCash: false,
    createsDebt: true,
    sortOrder: 3,
  }),
  // Un segundo medio que genera deuda, con OTRO codigo. Esta fila existe para
  // que ningun consumidor pueda pasar los tests comparando contra
  // 'cuenta_corriente': la pregunta es la bandera, no el nombre.
  buildMethod({
    id: 'pm-5',
    code: 'fiado_30',
    name: 'Fiado 30 dias',
    proofPolicy: 'none',
    countsAsCash: false,
    createsDebt: true,
    sortOrder: 4,
  }),
];

describe('proofPolicyOf', () => {
  it('reads the policy from the catalogue', () => {
    expect(proofPolicyOf(methods, 'efectivo')).toBe('none');
    expect(proofPolicyOf(methods, 'transferencia')).toBe('optional');
    expect(proofPolicyOf(methods, 'cheque')).toBe('required');
  });

  it('treats a churn row (null method) as having nothing to attach', () => {
    expect(proofPolicyOf(methods, null)).toBe('none');
    expect(proofPolicyOf(methods, undefined)).toBe('none');
  });

  /**
   * Un medio dado de baja despues de la venta ya no viaja en el catalogo
   * activo. Tratarlo como `none` esconderia un comprobante que de verdad
   * falta, asi que se asume `optional` -- el mismo resultado que daba el viejo
   * `!== 'efectivo'`.
   */
  it('falls back to optional for a code missing from the catalogue', () => {
    expect(proofPolicyOf(methods, 'qr')).toBe('optional');
  });

  it('falls back to optional even when the catalogue is empty', () => {
    expect(proofPolicyOf([], 'transferencia')).toBe('optional');
  });
});

describe('createsDebtOf', () => {
  it('reads the flag from the catalogue', () => {
    expect(createsDebtOf(methods, 'efectivo')).toBe(false);
    expect(createsDebtOf(methods, 'transferencia')).toBe(false);
    expect(createsDebtOf(methods, 'cuenta_corriente')).toBe(true);
  });

  /**
   * La regla se lee de la bandera, nunca del codigo. Un medio con otro nombre
   * y la misma bandera tiene que dar exactamente la misma respuesta: el dia
   * que el duenio agregue "fiado a 30 dias" no hay codigo que tocar.
   */
  it('answers by the flag, not by the code', () => {
    expect(createsDebtOf(methods, 'fiado_30')).toBe(true);
  });

  it('treats a churn row (no method) as creating no debt', () => {
    expect(createsDebtOf(methods, null)).toBe(false);
    expect(createsDebtOf(methods, undefined)).toBe(false);
  });

  /**
   * Un codigo que no esta en el catalogo -- o un catalogo que todavia no se
   * sincronizo -- deja la bandera DESCONOCIDA. Suponer deuda rechazaria una
   * venta ya cobrada en la calle por una regla que este lado no puede
   * verificar; el servidor la comprueba contra la tabla. Mismo criterio que
   * `createsDebtFor` en packages/shared.
   */
  it('falls back to false for a code missing from the catalogue', () => {
    expect(createsDebtOf(methods, 'mercadopago')).toBe(false);
  });

  it('falls back to false when the catalogue is empty', () => {
    expect(createsDebtOf([], 'cuenta_corriente')).toBe(false);
  });
});

describe('paymentMethodLabel', () => {
  it('reads the name from the catalogue', () => {
    expect(paymentMethodLabel(methods, 'transferencia')).toBe('Transferencia');
  });

  it('falls back to the raw code when the method is unknown', () => {
    expect(paymentMethodLabel(methods, 'mercadopago')).toBe('mercadopago');
  });

  it('uses the fallback text for a churn row', () => {
    expect(paymentMethodLabel(methods, null)).toBe('Sin pago');
    expect(paymentMethodLabel(methods, null, 'la venta')).toBe('la venta');
  });
});

describe('driverErrorMessage', () => {
  /**
   * El validador compartido habla en ingles y para el servidor. Al chofer hay
   * que decirle el MOTIVO -- que ese medio deja al cliente debiendo -- y que
   * tiene que hacer. "customerId is required" no es ninguna de las dos cosas.
   */
  it('rewrites the missing-debtor error in the driver language', () => {
    expect(
      driverErrorMessage(
        'customerId is required when the payment method creates debt',
        'Cuenta corriente',
        'elegí un cliente del padrón antes de guardar.',
      ),
    ).toBe(
      'Cuenta corriente queda como deuda del cliente: elegí un cliente del padrón antes de guardar.',
    );
  });

  it('names whichever method the driver actually chose', () => {
    expect(
      driverErrorMessage(
        'customerId is required when the payment method creates debt',
        'Fiado 30 días',
        'elegí un cliente del padrón antes de guardar.',
      ),
    ).toBe(
      'Fiado 30 días queda como deuda del cliente: elegí un cliente del padrón antes de guardar.',
    );
  });

  /**
   * Cualquier otro error pasa tal cual. Traducir a ciegas todo lo que devuelve
   * el validador esconderia un motivo nuevo detras de una frase vieja; un
   * string crudo es feo, pero es verdad.
   */
  it('passes any other validation error through untouched', () => {
    expect(driverErrorMessage('items must include at least one product', 'Efectivo', 'x')).toBe(
      'items must include at least one product',
    );
  });
});
