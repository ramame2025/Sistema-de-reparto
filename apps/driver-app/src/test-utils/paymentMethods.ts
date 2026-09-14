import type { PaymentMethodRecord } from '@distribuidor/shared';

/**
 * Los cuatro medios de pago semilla, con las MISMAS banderas que carga la
 * migracion `20260913120000_payment_methods_table`.
 *
 * Vive en un solo lugar para que los tests no se queden describiendo un
 * catalogo que la base ya no tiene: si la semilla cambia, cambia aca.
 */
export const buildPaymentMethod = (
  overrides: Partial<PaymentMethodRecord> = {},
): PaymentMethodRecord => ({
  id: 'pm-efectivo',
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

export const SEED_PAYMENT_METHODS: PaymentMethodRecord[] = [
  buildPaymentMethod(),
  buildPaymentMethod({
    id: 'pm-transferencia',
    code: 'transferencia',
    name: 'Transferencia',
    sortOrder: 1,
    proofPolicy: 'optional',
    countsAsCash: false,
  }),
  buildPaymentMethod({
    id: 'pm-qr',
    code: 'qr',
    name: 'QR',
    sortOrder: 2,
    proofPolicy: 'optional',
    countsAsCash: false,
  }),
  buildPaymentMethod({
    id: 'pm-tarjeta',
    code: 'tarjeta',
    name: 'Tarjeta',
    sortOrder: 3,
    proofPolicy: 'optional',
    countsAsCash: false,
  }),
];
