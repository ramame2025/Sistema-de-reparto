import type { PriceTable, SaleRecord } from '@distribuidor/shared';
import type { PendingSale } from './offlineQueue';
import { buildDayProblems, countVisitedCustomers, todaySalesOf } from './dayProblems';

const prices: PriceTable = {
  final: { G10: 8500, G15: 13000 },
  comercio: { G10: 8200, G15: 12600 },
  distribuidor: { G10: 7900, G15: 12100 },
};

const buildSale = (overrides: Partial<SaleRecord> = {}): SaleRecord => ({
  id: 's1',
  createdAt: '2026-08-28T14:30:00.000Z',
  occurredAt: '2026-08-28T14:30:00.000Z',
  status: 'active',
  driverName: 'chofer1',
  total: 23000,
  customerName: 'Kiosco La Esquina',
  customerType: 'comercio',
  paymentMethod: 'efectivo',
  items: [],
  kind: 'sale',
  ...overrides,
});

const buildQueued = (overrides: Partial<PendingSale> = {}): PendingSale => ({
  queueId: 'q1',
  kind: 'sale',
  createdAt: '2026-08-28T14:30:00.000Z',
  retries: 3,
  nextRetryAt: 0,
  payload: {
    driverName: 'chofer1',
    customerName: 'Kiosco La Esquina',
    customerType: 'comercio',
    paymentMethod: 'transferencia',
    items: [{ productCode: 'G10', quantity: 1 }],
  },
  ...overrides,
});

describe('todaySalesOf', () => {
  it('keeps only the sales recorded on the given day', () => {
    const sales = [
      buildSale({ id: 'today', createdAt: '2026-08-28T09:00:00.000Z' }),
      buildSale({ id: 'yesterday', createdAt: '2026-08-27T23:59:00.000Z' }),
    ];

    expect(todaySalesOf(sales, '2026-08-28').map((s) => s.id)).toEqual(['today']);
  });
});

describe('buildDayProblems/ventas que no se pudieron enviar', () => {
  it('reports a queued sale with the customer, the amount and how many attempts it took', () => {
    const problems = buildDayProblems([buildQueued()], [], prices);

    expect(problems).toEqual([
      {
        kind: 'not-sent',
        id: 'q1',
        customerName: 'Kiosco La Esquina',
        total: 8200,
        attempts: 3,
      },
    ]);
  });

  it('still reports a queued sale when the phone has no price table to value it with', () => {
    const [problem] = buildDayProblems([buildQueued()], [], null);

    expect(problem.kind).toBe('not-sent');
    expect(problem.total).toBeUndefined();
  });

  it('reports a queued empty visit, which has no items to add up', () => {
    const queued = buildQueued({
      queueId: 'q-churn',
      kind: 'churn',
      payload: { driverName: 'chofer1', customerName: 'Marta Suárez', customerType: 'final' },
    });

    const [problem] = buildDayProblems([queued], [], prices);

    expect(problem).toMatchObject({ kind: 'not-sent', customerName: 'Marta Suárez' });
    expect(problem.total).toBeUndefined();
  });
});

describe('buildDayProblems/entrada de cola malformada', () => {
  it('still lists an entry whose payload did not survive storage, instead of crashing', () => {
    // Inicio es la primera pantalla que el chofer abre. Una entrada rota
    // (version vieja de la app, escritura cortada) no puede dejarlo sin portada.
    const broken = { queueId: 'q-broken', retries: 1, nextRetryAt: 0, createdAt: '' } as never;

    const [problem] = buildDayProblems([broken], [], prices);

    expect(problem).toMatchObject({ kind: 'not-sent', id: 'q-broken' });
    expect(problem.customerName).toBe('Venta sin datos');
    expect(problem.total).toBeUndefined();
  });
});

describe('buildDayProblems/ventas sin comprobante', () => {
  it('flags a transfer with no proof attached', () => {
    const sales = [
      buildSale({ id: 's-transfer', paymentMethod: 'transferencia', total: 96000 }),
    ];

    expect(buildDayProblems([], sales, prices)).toEqual([
      {
        kind: 'missing-proof',
        id: 's-transfer',
        customerName: 'Kiosco La Esquina',
        total: 96000,
        paymentMethod: 'transferencia',
      },
    ]);
  });

  it.each(['qr', 'tarjeta'] as const)('flags a %s payment with no proof attached', (method) => {
    const sales = [buildSale({ id: 's1', paymentMethod: method })];

    expect(buildDayProblems([], sales, prices)).toHaveLength(1);
  });

  it('never flags a cash sale, which has no proof to attach', () => {
    const sales = [buildSale({ paymentMethod: 'efectivo' })];

    expect(buildDayProblems([], sales, prices)).toEqual([]);
  });

  it('does not flag a sale that already carries its proof', () => {
    const sales = [
      buildSale({ paymentMethod: 'transferencia', paymentProofRef: 'https://cdn/p.jpg' }),
    ];

    expect(buildDayProblems([], sales, prices)).toEqual([]);
  });

  it('ignores a canceled sale, which nobody has to fix', () => {
    const sales = [buildSale({ paymentMethod: 'transferencia', status: 'canceled' })];

    expect(buildDayProblems([], sales, prices)).toEqual([]);
  });

  it('ignores an empty visit, which was never charged', () => {
    const sales = [buildSale({ kind: 'churn', paymentMethod: null })];

    expect(buildDayProblems([], sales, prices)).toEqual([]);
  });
});

describe('buildDayProblems/orden', () => {
  it('puts the sales the server never received before the ones missing a proof', () => {
    const sales = [buildSale({ id: 's-transfer', paymentMethod: 'transferencia' })];

    const kinds = buildDayProblems([buildQueued()], sales, prices).map((p) => p.kind);

    // Una venta que el servidor no tiene se pierde si el telefono se rompe;
    // una sin comprobante ya esta guardada. La urgente va primero.
    expect(kinds).toEqual(['not-sent', 'missing-proof']);
  });
});

describe('countVisitedCustomers', () => {
  it('counts an assigned customer as visited once a sale is linked to it', () => {
    const sales = [buildSale({ customerId: 'c1' }), buildSale({ customerId: 'c2' })];

    expect(countVisitedCustomers(['c1', 'c2', 'c3'], sales)).toBe(2);
  });

  it('counts a customer once even with several sales in the day', () => {
    const sales = [buildSale({ id: 'a', customerId: 'c1' }), buildSale({ id: 'b', customerId: 'c1' })];

    expect(countVisitedCustomers(['c1', 'c2'], sales)).toBe(1);
  });

  it('ignores sales linked to customers that are not assigned today', () => {
    const sales = [buildSale({ customerId: 'other' })];

    expect(countVisitedCustomers(['c1'], sales)).toBe(0);
  });

  it('counts an empty visit as a visit, because the driver did go', () => {
    const sales = [buildSale({ customerId: 'c1', kind: 'churn', paymentMethod: null })];

    expect(countVisitedCustomers(['c1'], sales)).toBe(1);
  });

  it('does not count a visit whose sale was canceled', () => {
    const sales = [buildSale({ customerId: 'c1', status: 'canceled' })];

    expect(countVisitedCustomers(['c1'], sales)).toBe(0);
  });
});
