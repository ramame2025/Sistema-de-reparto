import {
  computeBackoff,
  isDue,
  applySyncFailure,
  normalizePendingSalePayload,
  type PendingSale,
} from './offlineQueue';
import type { CreateSaleInput } from '@distribuidor/shared';

describe('offlineQueue/computeBackoff', () => {
  it('returns 5000ms for the first retry (retries=0)', () => {
    expect(computeBackoff(0)).toBe(5000);
  });

  it('doubles per retry up to retries=3', () => {
    expect(computeBackoff(3)).toBe(40000);
  });

  it('caps at 300000ms (5 minutes) once the exponential exceeds it', () => {
    expect(computeBackoff(10)).toBe(300000);
  });
});

const buildEntry = (overrides: Partial<PendingSale> = {}): PendingSale => ({
  queueId: 'q_1',
  payload: {
    driverName: 'chofer1',
    truckCode: 'CAMION-01',
    customerName: 'Cliente',
    customerType: 'final',
    paymentMethod: 'efectivo',
    items: [],
  },
  createdAt: '2026-01-01T00:00:00.000Z',
  retries: 0,
  nextRetryAt: 0,
  ...overrides,
});

describe('offlineQueue/isDue', () => {
  it('is always due when manual is true, even if nextRetryAt is in the future', () => {
    const now = 1000;
    const entry = buildEntry({ nextRetryAt: now + 60000 });
    expect(isDue(entry, now, true)).toBe(true);
  });

  it('is due when not manual and nextRetryAt has already passed', () => {
    const now = 1000;
    const entry = buildEntry({ nextRetryAt: now - 1 });
    expect(isDue(entry, now, false)).toBe(true);
  });

  it('is NOT due when not manual and nextRetryAt is still in the future', () => {
    const now = 1000;
    const entry = buildEntry({ nextRetryAt: now + 1 });
    expect(isDue(entry, now, false)).toBe(false);
  });
});

describe('offlineQueue/applySyncFailure', () => {
  it('increments retries by 1 and sets lastError to the given message', () => {
    const entry = buildEntry({ retries: 0 });
    const result = applySyncFailure(entry, 'API 500', 1000);
    expect(result.retries).toBe(1);
    expect(result.lastError).toBe('API 500');
  });

  it('computes nextRetryAt using computeBackoff(retries + 1) — the off-by-one preserved from the original call site', () => {
    const now = 1000;
    const entry = buildEntry({ retries: 0 });
    const result = applySyncFailure(entry, 'API 500', now);
    // retries=0 -> computeBackoff(0 + 1) = 10000, NOT computeBackoff(0) = 5000
    expect(result.nextRetryAt).toBe(now + 10000);
  });

  it('triangulates with a different retry count: retries=2 -> computeBackoff(3) = 40000', () => {
    const now = 5000;
    const entry = buildEntry({ retries: 2 });
    const result = applySyncFailure(entry, 'network error', now);
    expect(result.retries).toBe(3);
    expect(result.nextRetryAt).toBe(now + 40000);
  });

  it('does not mutate the original entry', () => {
    const entry = buildEntry({ retries: 0 });
    applySyncFailure(entry, 'API 500', 1000);
    expect(entry.retries).toBe(0);
    expect(entry.lastError).toBeUndefined();
  });
});

describe('offlineQueue/normalizePendingSalePayload', () => {
  const basePayload: CreateSaleInput = {
    driverName: '',
    truckCode: '',
    customerName: 'Cliente de prueba',
    customerType: 'final',
    paymentMethod: 'efectivo',
    items: [],
  };

  it('falls back to the provided driverName when payload.driverName is empty', () => {
    const result = normalizePendingSalePayload(basePayload, 'chofer1', 'CAMION-02');
    expect(result.driverName).toBe('chofer1');
  });

  it('keeps the trimmed original driverName when present', () => {
    const result = normalizePendingSalePayload(
      { ...basePayload, driverName: '  chofer2  ' },
      'chofer1',
      'CAMION-02',
    );
    expect(result.driverName).toBe('chofer2');
  });

  it('falls back to the fallbackTruckCode when payload.truckCode is empty', () => {
    const result = normalizePendingSalePayload(basePayload, 'chofer1', 'CAMION-02');
    expect(result.truckCode).toBe('CAMION-02');
  });

  it('sets truckCode to undefined when both payload and fallback are empty', () => {
    const result = normalizePendingSalePayload(basePayload, 'chofer1', '');
    expect(result.truckCode).toBeUndefined();
  });
});
