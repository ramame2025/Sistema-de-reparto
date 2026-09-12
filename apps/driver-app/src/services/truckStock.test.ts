import type { ProductRecord, TruckStockLine } from '@distribuidor/shared';
import type { PendingSale } from './offlineQueue';
import { buildTruckStockLines } from './truckStock';

const product = (code: string, name: string, sortOrder: number): ProductRecord => ({
  id: `product-${code}`,
  code,
  name,
  isActive: true,
  sortOrder,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const PRODUCTS: ProductRecord[] = [
  product('G10', 'G10', 1),
  product('G15', 'G15', 2),
  product('G15_AUTO', 'G15 auto', 3),
];

const stockLine = (overrides: Partial<TruckStockLine> = {}): TruckStockLine => ({
  productCode: 'G10',
  loaded: 30,
  sold: 18,
  remaining: 12,
  ...overrides,
});

const queued = (
  items: { productCode: string; quantity: number }[],
  overrides: Partial<PendingSale> = {},
): PendingSale =>
  ({
    queueId: `queue-${items.map((item) => item.productCode).join('-')}`,
    kind: 'sale',
    payload: { customerType: 'comercio', items },
    createdAt: '2026-01-31T12:00:00.000Z',
    retries: 0,
    nextRetryAt: 0,
    ...overrides,
  }) as PendingSale;

const TODAY = '2026-01-31';

describe('buildTruckStockLines', () => {
  it('passes the server numbers through when the queue is empty', () => {
    const result = buildTruckStockLines([stockLine()], [], PRODUCTS, TODAY);

    expect(result).toEqual([{ productCode: 'G10', label: 'G10', loaded: 30, remaining: 12 }]);
  });

  it('subtracts sales the server has not received yet, so the count is honest offline', () => {
    const result = buildTruckStockLines(
      [stockLine()],
      [queued([{ productCode: 'G10', quantity: 5 }])],
      PRODUCTS,
      TODAY,
    );

    expect(result[0].remaining).toBe(7);
  });

  it('leaves `loaded` alone: the queue changes what is left, never what was loaded', () => {
    const result = buildTruckStockLines(
      [stockLine()],
      [queued([{ productCode: 'G10', quantity: 5 }])],
      PRODUCTS,
      TODAY,
    );

    expect(result[0].loaded).toBe(30);
  });

  it('adds up every queued entry, across sales and line items', () => {
    const result = buildTruckStockLines(
      [stockLine(), stockLine({ productCode: 'G15', loaded: 25, sold: 16, remaining: 9 })],
      [
        queued([
          { productCode: 'G10', quantity: 2 },
          { productCode: 'G15', quantity: 1 },
        ]),
        queued([{ productCode: 'G10', quantity: 3 }], { queueId: 'queue-2' }),
      ],
      PRODUCTS,
      TODAY,
    );

    expect(result[0].remaining).toBe(7);
    expect(result[1].remaining).toBe(8);
  });

  it('ignores a queued visit with no sale: nothing left the truck', () => {
    const result = buildTruckStockLines(
      [stockLine()],
      [
        {
          queueId: 'queue-churn',
          kind: 'churn',
          payload: { customerType: 'comercio' },
          createdAt: '2026-01-31T12:00:00.000Z',
          retries: 0,
          nextRetryAt: 0,
        } as unknown as PendingSale,
      ],
      PRODUCTS,
      TODAY,
    );

    expect(result[0].remaining).toBe(12);
  });

  it('ignores a queued sale from another day, which is not part of today’s manifest', () => {
    const result = buildTruckStockLines(
      [stockLine()],
      [
        queued([{ productCode: 'G10', quantity: 5 }], {
          createdAt: '2026-01-30T12:00:00.000Z',
        }),
      ],
      PRODUCTS,
      TODAY,
    );

    expect(result[0].remaining).toBe(12);
  });

  it('lets the remainder go negative rather than hiding an oversold product', () => {
    const result = buildTruckStockLines(
      [stockLine({ loaded: 5, sold: 4, remaining: 1 })],
      [queued([{ productCode: 'G10', quantity: 4 }])],
      PRODUCTS,
      TODAY,
    );

    expect(result[0].remaining).toBe(-3);
  });

  it('labels each line with the catalog name, not the raw code', () => {
    const result = buildTruckStockLines(
      [stockLine({ productCode: 'G15_AUTO', loaded: 10, sold: 5, remaining: 5 })],
      [],
      PRODUCTS,
      TODAY,
    );

    expect(result[0].label).toBe('G15 auto');
  });

  it('falls back to the code for a product the catalog no longer lists, instead of dropping the line', () => {
    const result = buildTruckStockLines(
      [stockLine({ productCode: 'G45', loaded: 6, sold: 3, remaining: 3 })],
      [],
      PRODUCTS,
      TODAY,
    );

    expect(result[0]).toEqual({ productCode: 'G45', label: 'G45', loaded: 6, remaining: 3 });
  });

  it('keeps the order the server sent, which is the order the admin defined', () => {
    const result = buildTruckStockLines(
      [
        stockLine({ productCode: 'G15' }),
        stockLine({ productCode: 'G10' }),
        stockLine({ productCode: 'G15_AUTO' }),
      ],
      [],
      PRODUCTS,
      TODAY,
    );

    expect(result.map((line) => line.productCode)).toEqual(['G15', 'G10', 'G15_AUTO']);
  });
  it('counts a queue entry with no date at all: not counting it would overstate what is left', () => {
    const result = buildTruckStockLines(
      [stockLine()],
      [queued([{ productCode: 'G10', quantity: 5 }], { createdAt: undefined as never })],
      PRODUCTS,
      TODAY,
    );

    expect(result[0].remaining).toBe(7);
  });
  it('ignores a queue entry with no payload rather than crashing the whole card', () => {
    const result = buildTruckStockLines(
      [stockLine()],
      [queued([{ productCode: 'G10', quantity: 5 }], { payload: undefined as never })],
      PRODUCTS,
      TODAY,
    );

    expect(result[0].remaining).toBe(12);
  });
});
