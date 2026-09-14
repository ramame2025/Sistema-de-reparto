import type { PaymentMethodRecord } from '@distribuidor/shared';
import { paymentMethodLabel, proofPolicyOf } from './paymentMethods';

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
