jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from './AuthContext';
import { SyncProvider, useSync } from './SyncContext';
import { computeBackoff, type PendingSale } from '../services/offlineQueue';
import type { CreateSaleInput, SaleRecord } from '@distribuidor/shared';

const DRIVER_AUTH_TOKEN_KEY = 'driver_auth_token_v1';
const OFFLINE_QUEUE_KEY = 'driver_pending_sales_v1';

const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as Response;

const emptySalesResponse = () => jsonResponse([] as SaleRecord[]);

/**
 * Routes fetch calls by endpoint so `/auth/me` (restore-on-mount), `GET /sales`
 * (refreshDaySummary), and `POST /sales` (trySendSale) can each be controlled
 * independently within a single test, matching real traffic shape.
 */
const makeFetchRouter = (
  overrides: {
    authMe?: () => Promise<Response>;
    getSales?: () => Promise<Response>;
    postSale?: () => Promise<Response>;
  } = {},
): typeof fetch =>
  jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/auth/me')) {
      return overrides.authMe
        ? overrides.authMe()
        : Promise.resolve(jsonResponse({ username: 'chofer1', role: 'chofer' }));
    }
    if (url.endsWith('/sales') && init?.method === 'POST') {
      return overrides.postSale
        ? overrides.postSale()
        : Promise.resolve(jsonResponse({ id: 'sale-default' }));
    }
    if (url.endsWith('/sales')) {
      return overrides.getSales ? overrides.getSales() : Promise.resolve(emptySalesResponse());
    }
    return Promise.resolve(emptySalesResponse());
  }) as unknown as typeof fetch;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>
    <SyncProvider>{children}</SyncProvider>
  </AuthProvider>
);

const useHarness = () => ({ auth: useAuth(), sync: useSync() });

const buildPayload = (overrides: Partial<CreateSaleInput> = {}): CreateSaleInput => ({
  driverName: 'chofer1',
  truckCode: 'CAMION-01',
  customerName: 'Cliente de prueba',
  customerType: 'final',
  paymentMethod: 'efectivo',
  items: [{ productCode: 'G10', quantity: 1 }],
  ...overrides,
});

const buildEntry = (overrides: Partial<PendingSale> = {}): PendingSale => ({
  queueId: 'q_seed_1',
  payload: buildPayload(),
  createdAt: '2026-01-01T00:00:00.000Z',
  retries: 0,
  nextRetryAt: 0,
  ...overrides,
});

/**
 * Seeds AsyncStorage with a saved token BEFORE rendering, then renders the
 * combined Auth+Sync harness and waits for restore-on-mount to authenticate.
 * The token MUST be set before `renderHook` — AuthProvider's restore effect
 * only reads AsyncStorage once, on mount.
 */
const renderAuthenticated = async () => {
  await AsyncStorage.setItem(DRIVER_AUTH_TOKEN_KEY, 'saved-token');
  const { result } = await renderHook(() => useHarness(), { wrapper });
  await waitFor(() => expect(result.current.auth.status).toBe('authenticated'));
  return result;
};

describe('SyncContext/4.1 enqueueSale persistence + due filtering', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('enqueueSale persists the queue under driver_pending_sales_v1 exactly like the current persistPendingSales()', async () => {
    globalThis.fetch = makeFetchRouter();
    const result = await renderAuthenticated();

    let newLength = -1;
    await act(async () => {
      newLength = await result.current.sync.enqueueSale(buildPayload(), 'offline');
    });

    expect(newLength).toBe(1);
    expect(result.current.sync.pendingSales).toHaveLength(1);
    expect(result.current.sync.pendingSales[0].lastError).toBe('offline');

    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const stored = JSON.parse(raw as string);
    expect(stored).toHaveLength(1);
    expect(stored[0].payload.customerName).toBe('Cliente de prueba');
  });

  it('restores a previously persisted queue from driver_pending_sales_v1 on mount', async () => {
    await AsyncStorage.setItem(
      OFFLINE_QUEUE_KEY,
      JSON.stringify([buildEntry({ queueId: 'q_restored', nextRetryAt: 0 })]),
    );
    globalThis.fetch = makeFetchRouter();
    const result = await renderAuthenticated();

    await waitFor(() => expect(result.current.sync.pendingSales).toHaveLength(1));
    expect(result.current.sync.pendingSales[0].queueId).toBe('q_restored');
  });

  it('an automatic sync (manual=false) skips a seeded entry whose nextRetryAt is still in the future', async () => {
    const farFuture = Date.now() + 60 * 60 * 1000;
    await AsyncStorage.setItem(
      OFFLINE_QUEUE_KEY,
      JSON.stringify([buildEntry({ queueId: 'q_not_due', nextRetryAt: farFuture })]),
    );
    globalThis.fetch = makeFetchRouter();
    const result = await renderAuthenticated();
    await waitFor(() => expect(result.current.sync.pendingSales).toHaveLength(1));

    (globalThis.fetch as jest.Mock).mockClear();

    let outcome: { synced: number; remaining: number; skipped: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.sync.syncPendingSales(false);
    });

    expect(outcome).toEqual({ synced: 0, remaining: 1, skipped: false });
    expect(result.current.sync.pendingSales).toHaveLength(1);
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      'http://localhost:4000/sales',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('a manual sync (manual=true) attempts a seeded entry even if its nextRetryAt is in the future', async () => {
    const farFuture = Date.now() + 60 * 60 * 1000;
    await AsyncStorage.setItem(
      OFFLINE_QUEUE_KEY,
      JSON.stringify([buildEntry({ queueId: 'q_not_due', nextRetryAt: farFuture })]),
    );
    globalThis.fetch = makeFetchRouter({
      postSale: () => Promise.resolve(jsonResponse({ id: 'sale-manual' })),
    });
    const result = await renderAuthenticated();
    await waitFor(() => expect(result.current.sync.pendingSales).toHaveLength(1));

    let outcome: { synced: number; remaining: number; skipped: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.sync.syncPendingSales(true);
    });

    expect(outcome).toEqual({ synced: 1, remaining: 0, skipped: false });
    expect(result.current.sync.pendingSales).toHaveLength(0);
  });

  it('reports skipped:true and touches no network when the queue is empty', async () => {
    globalThis.fetch = makeFetchRouter();
    const result = await renderAuthenticated();

    (globalThis.fetch as jest.Mock).mockClear();

    let outcome: { synced: number; remaining: number; skipped: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.sync.syncPendingSales(false);
    });

    expect(outcome).toEqual({ synced: 0, remaining: 0, skipped: true });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('SyncContext/4.1b fallbackTruckCode contract', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('defaults fallbackTruckCode to CAMION-01, matching the original App.tsx default state', async () => {
    globalThis.fetch = makeFetchRouter();
    const result = await renderAuthenticated();

    expect(result.current.sync.fallbackTruckCode).toBe('CAMION-01');
  });

  it('setFallbackTruckCode updates the exposed value', async () => {
    globalThis.fetch = makeFetchRouter();
    const result = await renderAuthenticated();

    await act(async () => {
      result.current.sync.setFallbackTruckCode('CAMION-09');
    });

    expect(result.current.sync.fallbackTruckCode).toBe('CAMION-09');
  });

  it('normalizes a restored entry missing truckCode using the current fallbackTruckCode (trimmed), preserving loadPendingSales() behavior', async () => {
    await AsyncStorage.setItem(
      OFFLINE_QUEUE_KEY,
      JSON.stringify([
        buildEntry({
          queueId: 'q_no_truck',
          payload: buildPayload({ truckCode: '' }),
        }),
      ]),
    );
    globalThis.fetch = makeFetchRouter();
    const result = await renderAuthenticated();

    await waitFor(() => expect(result.current.sync.pendingSales).toHaveLength(1));
    expect(result.current.sync.pendingSales[0].payload.truckCode).toBe('CAMION-01');
  });
});

describe('SyncContext/4.2 backoff wiring on failure, removal on success', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('on trySendSale failure, sets nextRetryAt using computeBackoff(retries + 1) via applySyncFailure, keeps the entry queued and persisted', async () => {
    globalThis.fetch = makeFetchRouter({
      postSale: () =>
        Promise.resolve({ ok: false, status: 500, text: async () => 'server exploded' } as Response),
    });
    const result = await renderAuthenticated();

    await act(async () => {
      await result.current.sync.enqueueSale(buildPayload(), 'offline');
    });

    const before = Date.now();
    let outcome: { synced: number; remaining: number; skipped: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.sync.syncPendingSales(true);
    });
    const after = Date.now();

    expect(outcome).toEqual({ synced: 0, remaining: 1, skipped: false });
    const entry = result.current.sync.pendingSales[0];
    expect(entry.retries).toBe(1);
    expect(entry.lastError).toBe('server exploded');
    // nextRetryAt must equal now + computeBackoff(retries + 1) = now + computeBackoff(1),
    // where "now" is whatever wall-clock instant applySyncFailure captured during the call.
    const expectedBackoff = computeBackoff(1);
    expect(entry.nextRetryAt).toBeGreaterThanOrEqual(before + expectedBackoff);
    expect(entry.nextRetryAt).toBeLessThanOrEqual(after + expectedBackoff);

    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const stored = JSON.parse(raw as string);
    expect(stored).toHaveLength(1);
    expect(stored[0].retries).toBe(1);
  });

  it('on trySendSale success, removes the entry from the queue and persists the removal', async () => {
    globalThis.fetch = makeFetchRouter({
      postSale: () => Promise.resolve(jsonResponse({ id: 'sale-ok' })),
    });
    const result = await renderAuthenticated();

    await act(async () => {
      await result.current.sync.enqueueSale(buildPayload(), 'offline');
    });

    await act(async () => {
      await result.current.sync.syncPendingSales(true);
    });

    expect(result.current.sync.pendingSales).toHaveLength(0);
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    expect(JSON.parse(raw as string)).toHaveLength(0);
  });
});

describe('SyncContext/4.3 auto-sync interval + resubscription', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fires syncPendingSales(false) every 15000ms via setInterval', async () => {
    globalThis.fetch = makeFetchRouter({
      postSale: () => Promise.resolve(jsonResponse({ id: 'sale-tick' })),
    });
    await AsyncStorage.setItem(DRIVER_AUTH_TOKEN_KEY, 'saved-token');
    const { result } = await renderHook(() => useHarness(), { wrapper });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    await waitFor(() => expect(result.current.auth.status).toBe('authenticated'));

    await act(async () => {
      await result.current.sync.enqueueSale(buildPayload(), 'offline');
    });

    (globalThis.fetch as jest.Mock).mockClear();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(15000);
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/sales',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('resubscribes (tears down and recreates the interval) whenever pendingSales changes', async () => {
    globalThis.fetch = makeFetchRouter();
    const setIntervalSpy = jest.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = jest.spyOn(globalThis, 'clearInterval');

    await AsyncStorage.setItem(DRIVER_AUTH_TOKEN_KEY, 'saved-token');
    const { result } = await renderHook(() => useHarness(), { wrapper });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    await waitFor(() => expect(result.current.auth.status).toBe('authenticated'));

    const setIntervalCallsBefore = setIntervalSpy.mock.calls.length;
    const clearIntervalCallsBefore = clearIntervalSpy.mock.calls.length;

    await act(async () => {
      await result.current.sync.enqueueSale(buildPayload(), 'offline');
    });

    expect(clearIntervalSpy.mock.calls.length).toBeGreaterThan(clearIntervalCallsBefore);
    expect(setIntervalSpy.mock.calls.length).toBeGreaterThan(setIntervalCallsBefore);

    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it('never uses a stale queue snapshot on the next tick: a sale enqueued right before the tick IS attempted at that same tick', async () => {
    globalThis.fetch = makeFetchRouter({
      postSale: () => Promise.resolve(jsonResponse({ id: 'sale-fresh' })),
    });
    await AsyncStorage.setItem(DRIVER_AUTH_TOKEN_KEY, 'saved-token');
    const { result } = await renderHook(() => useHarness(), { wrapper });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    await waitFor(() => expect(result.current.auth.status).toBe('authenticated'));

    // Let the initial (empty-queue) interval tick once — proves it runs on an
    // empty queue without throwing, and does NOT sync anything (nothing queued yet).
    (globalThis.fetch as jest.Mock).mockClear();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(15000);
    });
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      'http://localhost:4000/sales',
      expect.objectContaining({ method: 'POST' }),
    );

    // Enqueue a sale mid-cycle (before the next 15s tick elapses). This
    // resubscribes the interval (new closure over the updated pendingSales).
    await act(async () => {
      await result.current.sync.enqueueSale(
        buildPayload({ customerName: 'Recien encolada' }),
        'offline',
      );
    });

    (globalThis.fetch as jest.Mock).mockClear();

    // Advance only the resubscribed interval's own 15000ms window (not 2x),
    // proving the queue-mutation-triggered resubscription reset the timer
    // with the FRESH closure/queue snapshot rather than an old, stale one.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(15000);
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/sales',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Recien encolada'),
      }),
    );
  });
});

describe('SyncContext/4.4 refreshDaySummary chaining + visible summaryError', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('a successful syncPendingSales chains into refreshDaySummary() automatically', async () => {
    const today = new Date().toISOString();
    const saleRecord: SaleRecord = {
      id: 'sale-ok',
      createdAt: today,
      status: 'active',
      driverName: 'chofer1',
      truckCode: 'CAMION-01',
      total: 500,
      customerName: 'Cliente de prueba',
      customerType: 'final',
      paymentMethod: 'efectivo',
      items: [{ productCode: 'G10', quantity: 1 }],
    };

    globalThis.fetch = makeFetchRouter({
      postSale: () => Promise.resolve(jsonResponse({ id: 'sale-ok' })),
      getSales: () => Promise.resolve(jsonResponse([saleRecord])),
    });
    const result = await renderAuthenticated();

    await act(async () => {
      await result.current.sync.enqueueSale(buildPayload(), 'offline');
    });

    await act(async () => {
      await result.current.sync.syncPendingSales(true);
    });

    expect(result.current.sync.daySummary).toEqual({
      activeCount: 1,
      canceledCount: 0,
      activeTotal: 500,
    });
    expect(result.current.sync.summaryError).toBeNull();
  });

  it('refreshDaySummary failure sets a visible summaryError (deliberate change from the original silent catch)', async () => {
    globalThis.fetch = makeFetchRouter({
      getSales: () =>
        Promise.resolve({ ok: false, status: 500, text: async () => 'summary down' } as Response),
    });
    const result = await renderAuthenticated();

    await waitFor(() => expect(result.current.sync.summaryError).toBe('summary down'));
  });

  it('refreshDaySummary clears a previous summaryError on a subsequent success', async () => {
    let shouldFail = true;
    globalThis.fetch = makeFetchRouter({
      getSales: () =>
        shouldFail
          ? Promise.resolve({ ok: false, status: 500, text: async () => 'summary down' } as Response)
          : Promise.resolve(emptySalesResponse()),
    });
    const result = await renderAuthenticated();
    await waitFor(() => expect(result.current.sync.summaryError).toBe('summary down'));

    shouldFail = false;
    await act(async () => {
      await result.current.sync.refreshDaySummary();
    });

    expect(result.current.sync.summaryError).toBeNull();
  });
});
