jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from './AuthContext';
import { SyncProvider, useSync } from './SyncContext';
import { TruckProvider, useTruck } from './TruckContext';
import { computeBackoff, type PendingSale } from '../services/offlineQueue';
import type { CreateSaleInput, RecordEmptyVisitInput, SaleRecord } from '@distribuidor/shared';

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
 * Routes fetch calls by endpoint so `/auth/me` (restore-on-mount),
 * `GET /sales/mine` (refreshDaySummary — driver-scoped, PR10), and
 * `POST /sales` (trySendSale) can each be controlled independently within a
 * single test, matching real traffic shape.
 */
const makeFetchRouter = (
  overrides: {
    authMe?: () => Promise<Response>;
    myTruck?: () => Promise<Response>;
    getSales?: () => Promise<Response>;
    postSale?: () => Promise<Response>;
    postEmptyVisit?: () => Promise<Response>;
  } = {},
): typeof fetch =>
  jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/sales/empty-visit') && init?.method === 'POST') {
      return overrides.postEmptyVisit
        ? overrides.postEmptyVisit()
        : Promise.resolve(jsonResponse({ id: 'visit-default' }));
    }
    if (url.endsWith('/auth/me')) {
      return overrides.authMe
        ? overrides.authMe()
        : Promise.resolve(jsonResponse({ username: 'chofer1', role: 'chofer' }));
    }
    if (url.includes('/driver-truck-assignments/me')) {
      return overrides.myTruck
        ? overrides.myTruck()
        : Promise.resolve(
            jsonResponse({
              date: '2026-02-11',
              truck: {
                assignmentId: 'a-1',
                kind: 'titular',
                truckId: 'truck-1',
                code: 'CAMION-01',
                plate: 'AB123CD',
                capacity: 40,
                startDate: '2026-02-01T00:00:00.000Z',
                endDate: null,
              },
            }),
          );
    }
    if (url.endsWith('/sales') && init?.method === 'POST') {
      return overrides.postSale
        ? overrides.postSale()
        : Promise.resolve(jsonResponse({ id: 'sale-default' }));
    }
    if (url.endsWith('/sales/mine')) {
      return overrides.getSales ? overrides.getSales() : Promise.resolve(emptySalesResponse());
    }
    return Promise.resolve(emptySalesResponse());
  }) as unknown as typeof fetch;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>
    <TruckProvider>
      <SyncProvider>{children}</SyncProvider>
    </TruckProvider>
  </AuthProvider>
);

const useHarness = () => ({ auth: useAuth(), sync: useSync(), truck: useTruck() });

const buildPayload = (overrides: Partial<CreateSaleInput> = {}): CreateSaleInput => ({
  driverName: 'chofer1',
  truckCode: 'CAMION-01',
  customerName: 'Cliente de prueba',
  customerType: 'final',
  paymentMethod: 'efectivo',
  items: [{ productCode: 'G10', quantity: 1 }],
  ...overrides,
});

const buildEmptyVisitPayload = (
  overrides: Partial<RecordEmptyVisitInput> = {},
): RecordEmptyVisitInput => ({
  driverName: 'chofer1',
  truckCode: 'CAMION-01',
  customerName: 'Cliente de prueba',
  customerType: 'final',
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

describe('SyncContext/4.1b codigo de camion tomado de la asignacion', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('takes the truck code from the assigned truck instead of a hardcoded default', async () => {
    globalThis.fetch = makeFetchRouter();
    const result = await renderAuthenticated();

    await waitFor(() => expect(result.current.sync.assignedTruckCode).toBe('CAMION-01'));
  });

  it('leaves the truck code empty when the driver has no truck today', async () => {
    globalThis.fetch = makeFetchRouter({
      myTruck: () => Promise.resolve(jsonResponse({ date: '2026-01-15', truck: null })),
    });
    const result = await renderAuthenticated();

    await waitFor(() => expect(result.current.truck.status).toBe('ready'));
    expect(result.current.sync.assignedTruckCode).toBe('');
  });

  it('fills a legacy queued entry that has no truckCode with the currently assigned truck', async () => {
    await AsyncStorage.setItem(
      OFFLINE_QUEUE_KEY,
      JSON.stringify([
        buildEntry({ queueId: 'q_no_truck', payload: buildPayload({ truckCode: '' }) }),
      ]),
    );
    globalThis.fetch = makeFetchRouter();
    const result = await renderAuthenticated();

    await waitFor(() => expect(result.current.sync.pendingSales).toHaveLength(1));
    await waitFor(() =>
      expect(result.current.sync.pendingSales[0].payload.truckCode).toBe('CAMION-01'),
    );
  });

  it('NEVER rewrites a queued sale that already carries its own truckCode', async () => {
    // Una venta encolada ayer con el CAMION-09 se hizo en ESE camion. Si hoy
    // el chofer maneja otro, reescribirla falsearia el historial de reparto.
    await AsyncStorage.setItem(
      OFFLINE_QUEUE_KEY,
      JSON.stringify([
        buildEntry({ queueId: 'q_ayer', payload: buildPayload({ truckCode: 'CAMION-09' }) }),
      ]),
    );
    globalThis.fetch = makeFetchRouter();
    const result = await renderAuthenticated();

    await waitFor(() => expect(result.current.sync.pendingSales).toHaveLength(1));
    expect(result.current.sync.pendingSales[0].payload.truckCode).toBe('CAMION-09');
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
      occurredAt: today,
      status: 'active',
      driverName: 'chofer1',
      truckCode: 'CAMION-01',
      total: 500,
      customerName: 'Cliente de prueba',
      customerType: 'final',
      paymentMethod: 'efectivo',
      items: [{ productCode: 'G10', quantity: 1, unitPrice: 500 }],
      kind: 'sale',
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

describe('SyncContext/10.3 driver-scoped sales endpoint (PR10)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('refreshDaySummary fetches the driver-scoped /sales/mine endpoint, never the admin-only /sales list', async () => {
    globalThis.fetch = makeFetchRouter({
      getSales: () => Promise.resolve(emptySalesResponse()),
    });
    await renderAuthenticated();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/sales/mine',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      'http://localhost:4000/sales',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });
});

describe('SyncContext/ventas de hoy expuestas para Inicio', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  const saleOn = (id: string, createdAt: string): SaleRecord => ({
    id,
    createdAt,
    occurredAt: createdAt,
    status: 'active',
    driverName: 'chofer1',
    total: 1000,
    customerName: 'Kiosco Sur',
    customerType: 'final',
    paymentMethod: 'efectivo',
    items: [],
    kind: 'sale',
  });

  it('exposes the same rows it counted, so Inicio does not fetch /sales/mine a second time', async () => {
    const today = new Date().toISOString().slice(0, 10);
    globalThis.fetch = makeFetchRouter({
      getSales: () =>
        Promise.resolve(
          jsonResponse([
            saleOn('today-1', `${today}T09:00:00.000Z`),
            saleOn('old-1', '2020-01-01T09:00:00.000Z'),
          ]),
        ),
    });

    const result = await renderAuthenticated();

    await waitFor(() => expect(result.current.sync.todaySales).toHaveLength(1));
    expect(result.current.sync.todaySales[0].id).toBe('today-1');
    // Un solo pedido: el resumen y el detalle salen de la misma respuesta.
    const salesCalls = (globalThis.fetch as jest.Mock).mock.calls.filter(
      (call) => call[0] === 'http://localhost:4000/sales/mine',
    );
    expect(salesCalls).toHaveLength(1);
  });

  it('starts empty rather than undefined, so a consumer can filter before the first fetch lands', async () => {
    globalThis.fetch = makeFetchRouter({
      getSales: () => Promise.resolve(emptySalesResponse()),
    });

    const result = await renderAuthenticated();

    expect(result.current.sync.todaySales).toEqual([]);
  });
});

describe('SyncContext/5.x churn action reuses the offline queue (visit-container-model Unit 4)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('trySendEmptyVisit posts to /sales/empty-visit and returns the created id', async () => {
    globalThis.fetch = makeFetchRouter({
      postEmptyVisit: () => Promise.resolve(jsonResponse({ id: 'visit-1' })),
    });
    const result = await renderAuthenticated();

    let id = '';
    await act(async () => {
      id = await result.current.sync.trySendEmptyVisit(buildEmptyVisitPayload());
    });

    expect(id).toBe('visit-1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/sales/empty-visit',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('enqueueEmptyVisit persists a churn-kind entry under the same offline queue key as sales', async () => {
    globalThis.fetch = makeFetchRouter();
    const result = await renderAuthenticated();

    let newLength = -1;
    await act(async () => {
      newLength = await result.current.sync.enqueueEmptyVisit(buildEmptyVisitPayload(), 'offline');
    });

    expect(newLength).toBe(1);
    expect(result.current.sync.pendingSales).toHaveLength(1);
    expect(result.current.sync.pendingSales[0].kind).toBe('churn');
    expect(result.current.sync.pendingSales[0].lastError).toBe('offline');

    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const stored = JSON.parse(raw as string);
    expect(stored).toHaveLength(1);
    expect(stored[0].kind).toBe('churn');
  });

  it('syncPendingSales retries a queued churn entry against /sales/empty-visit, never /sales', async () => {
    globalThis.fetch = makeFetchRouter({
      postEmptyVisit: () => Promise.resolve(jsonResponse({ id: 'visit-synced' })),
    });
    const result = await renderAuthenticated();

    await act(async () => {
      await result.current.sync.enqueueEmptyVisit(buildEmptyVisitPayload(), 'offline');
    });

    let outcome: { synced: number; remaining: number; skipped: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.sync.syncPendingSales(true);
    });

    expect(outcome).toEqual({ synced: 1, remaining: 0, skipped: false });
    expect(result.current.sync.pendingSales).toHaveLength(0);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/sales/empty-visit',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      'http://localhost:4000/sales',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('syncs a mixed queue (one sale, one churn visit), routing each to its own endpoint', async () => {
    globalThis.fetch = makeFetchRouter({
      postSale: () => Promise.resolve(jsonResponse({ id: 'sale-synced' })),
      postEmptyVisit: () => Promise.resolve(jsonResponse({ id: 'visit-synced' })),
    });
    const result = await renderAuthenticated();

    await act(async () => {
      await result.current.sync.enqueueSale(buildPayload(), 'offline');
    });
    await act(async () => {
      await result.current.sync.enqueueEmptyVisit(buildEmptyVisitPayload(), 'offline');
    });

    let outcome: { synced: number; remaining: number; skipped: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.sync.syncPendingSales(true);
    });

    expect(outcome).toEqual({ synced: 2, remaining: 0, skipped: false });
    expect(result.current.sync.pendingSales).toHaveLength(0);
  });

  it('treats a legacy queued entry with no kind field as a normal sale (backward compatibility)', async () => {
    await AsyncStorage.setItem(
      OFFLINE_QUEUE_KEY,
      JSON.stringify([buildEntry({ queueId: 'q_legacy' })]),
    );
    globalThis.fetch = makeFetchRouter({
      postSale: () => Promise.resolve(jsonResponse({ id: 'sale-legacy' })),
    });
    const result = await renderAuthenticated();
    await waitFor(() => expect(result.current.sync.pendingSales).toHaveLength(1));

    let outcome: { synced: number; remaining: number; skipped: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.sync.syncPendingSales(true);
    });

    expect(outcome).toEqual({ synced: 1, remaining: 0, skipped: false });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/sales',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
