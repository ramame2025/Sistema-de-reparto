import type { PaymentMethodRecord } from '@distribuidor/shared';

/**
 * Los medios de pago semilla, con las MISMAS banderas que cargan las
 * migraciones `20260913120000_payment_methods_table` (los cuatro primeros) y
 * `20260914100000_payment_method_creates_debt` (cuenta corriente).
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
  // Una venta a cuenta no tuvo pago: no hay comprobante que adjuntar
  // (`proofPolicy: 'none'`) ni plata que rendir (`countsAsCash: false`), y el
  // cliente sigue debiendo.
  buildPaymentMethod({
    id: 'pm-cuenta-corriente',
    code: 'cuenta_corriente',
    name: 'Cuenta corriente',
    sortOrder: 4,
    proofPolicy: 'none',
    countsAsCash: false,
    createsDebt: true,
  }),
];
