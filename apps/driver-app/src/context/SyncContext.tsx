import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { CreateSaleInput, RecordEmptyVisitInput, SaleRecord } from '@distribuidor/shared';
import { useAuth } from './AuthContext';
import { useTruck } from './TruckContext';
import {
  applySyncFailure,
  isDue,
  normalizePendingSalePayload,
  type PendingSale,
} from '../services/offlineQueue';
import { loadPendingSalesFromStorage, savePendingSalesToStorage } from '../services/storage';

export type { PendingSale };

/** Preserved verbatim from the current App.tsx implementation. */
const AUTO_SYNC_INTERVAL_MS = 15000;

export type DaySummary = {
  activeCount: number;
  canceledCount: number;
  activeTotal: number;
};

export type SyncOutcome = { synced: number; remaining: number; skipped: boolean };

export type SyncContextValue = {
  pendingSales: PendingSale[];
  syncing: boolean;
  daySummary: DaySummary;
  summaryLoading: boolean;
  summaryError: string | null;
  /** Codigo del camion que el chofer tiene asignado hoy, o '' si no tiene. */
  assignedTruckCode: string;
  trySendSale(payload: CreateSaleInput): Promise<string>;
  enqueueSale(payload: CreateSaleInput, cause: string): Promise<number>;
  /**
   * Churn twin of `trySendSale`/`enqueueSale`: same online-first-then-queue
   * pattern, routed to `POST /sales/empty-visit` instead of `POST /sales`.
   * Kept as separate functions (not an overload) so callers/tests read the
   * intent plainly, matching NewSaleScreen's visibly distinct action.
   */
  trySendEmptyVisit(payload: RecordEmptyVisitInput): Promise<string>;
  enqueueEmptyVisit(payload: RecordEmptyVisitInput, cause: string): Promise<number>;
  syncPendingSales(manual: boolean): Promise<SyncOutcome>;
  refreshDaySummary(): Promise<void>;
};

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

const buildQueueId = () => `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export function SyncProvider({ children }: { children: ReactNode }) {
  const { token, username, api } = useAuth();
  const { truck } = useTruck();

  // El camion ya no se escribe a mano: sale de la asignacion vigente.
  const assignedTruckCode = truck?.code ?? '';

  const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [daySummary, setDaySummary] = useState<DaySummary>({
    activeCount: 0,
    canceledCount: 0,
    activeTotal: 0,
  });
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const persistPendingSales = useCallback(async (next: PendingSale[]) => {
    setPendingSales(next);
    await savePendingSalesToStorage(next);
  }, []);

  const refreshDaySummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const sales = await api.get<SaleRecord[]>('/sales/mine', { cache: 'no-store' });
      const today = new Date().toISOString().slice(0, 10);
      const todaySales = sales.filter((sale) => sale.createdAt.slice(0, 10) === today);
      const active = todaySales.filter((sale) => sale.status === 'active');
      const canceled = todaySales.filter((sale) => sale.status === 'canceled');

      setDaySummary({
        activeCount: active.length,
        canceledCount: canceled.length,
        activeTotal: active.reduce((acc, sale) => acc + sale.total, 0),
      });
      setSummaryError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo actualizar el resumen.';
      setSummaryError(message);
    } finally {
      setSummaryLoading(false);
    }
  }, [api]);

  // La cola se restaura al instante porque tiene que funcionar sin red, pero el
  // camion asignado llega por HTTP y tarda. En vez de bloquear la restauracion
  // (lo que dejaria al chofer sin su cola offline), las entradas viejas sin
  // codigo de camion se rellenan cuando el camion finalmente se conoce.
  useEffect(() => {
    if (!assignedTruckCode) {
      return;
    }

    const needsBackfill = pendingSales.some((entry) => !entry.payload.truckCode?.trim());
    if (!needsBackfill) {
      return;
    }

    const filled = pendingSales.map((entry) => ({
      ...entry,
      payload: normalizePendingSalePayload(entry.payload, username, assignedTruckCode.trim()),
    }));

    void persistPendingSales(filled);
  }, [assignedTruckCode, pendingSales, username, persistPendingSales]);

  // Restore the persisted queue once authenticated. `normalizePendingSalePayload`
  // solo RELLENA lo que falta: una venta encolada que ya trae su truckCode
  // conserva el suyo, porque se hizo en ESE camion aunque hoy el chofer maneje
  // otro. El camion asignado solo cubre entradas viejas que quedaron sin codigo.
  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;

    const restore = async () => {
      try {
        const stored = await loadPendingSalesFromStorage();
        const normalized = stored.map((entry) => ({
          ...entry,
          payload: normalizePendingSalePayload(entry.payload, username, assignedTruckCode.trim()),
        }));

        if (cancelled) {
          return;
        }

        setPendingSales(normalized);
        await savePendingSalesToStorage(normalized);
      } catch {
        // Preserved: a corrupt/unreadable local queue leaves pendingSales empty
        // instead of crashing. Providers never set UI text (decision #4) — the
        // original's equivalent setMessage() call has no replacement here.
      }
    };

    void restore();
    void refreshDaySummary();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per auth transition, mirrors original `[authToken]` effect
  }, [token]);

  const trySendSale = useCallback(
    async (payload: CreateSaleInput): Promise<string> => {
      const saved = await api.post<{ id: string }>('/sales', payload);
      return saved.id;
    },
    [api],
  );

  const enqueueSale = useCallback(
    async (payload: CreateSaleInput, cause: string): Promise<number> => {
      const entry: PendingSale = {
        queueId: buildQueueId(),
        kind: 'sale',
        payload,
        createdAt: new Date().toISOString(),
        retries: 0,
        nextRetryAt: Date.now(),
        lastError: cause,
      };

      const next = [...pendingSales, entry];
      await persistPendingSales(next);
      return next.length;
    },
    [pendingSales, persistPendingSales],
  );

  const trySendEmptyVisit = useCallback(
    async (payload: RecordEmptyVisitInput): Promise<string> => {
      const saved = await api.post<{ id: string }>('/sales/empty-visit', payload);
      return saved.id;
    },
    [api],
  );

  const enqueueEmptyVisit = useCallback(
    async (payload: RecordEmptyVisitInput, cause: string): Promise<number> => {
      const entry: PendingSale = {
        queueId: buildQueueId(),
        kind: 'churn',
        payload,
        createdAt: new Date().toISOString(),
        retries: 0,
        nextRetryAt: Date.now(),
        lastError: cause,
      };

      const next = [...pendingSales, entry];
      await persistPendingSales(next);
      return next.length;
    },
    [pendingSales, persistPendingSales],
  );

  const syncPendingSales = useCallback(
    async (manual: boolean): Promise<SyncOutcome> => {
      if (!token) {
        return { synced: 0, remaining: pendingSales.length, skipped: true };
      }

      if (pendingSales.length === 0) {
        return { synced: 0, remaining: 0, skipped: true };
      }

      setSyncing(true);
      try {
        let remaining: PendingSale[] = [...pendingSales];
        let synced = 0;
        const now = Date.now();

        for (const entry of pendingSales) {
          if (!isDue(entry, now, manual)) {
            continue;
          }

          try {
            // Missing `kind` (legacy queued entry, persisted before this
            // field existed) is treated as 'sale' -- see PendingSale's doc
            // comment in offlineQueue.ts.
            if (entry.kind === 'churn') {
              await trySendEmptyVisit(entry.payload as RecordEmptyVisitInput);
            } else {
              await trySendSale(entry.payload as CreateSaleInput);
            }
            synced += 1;
            remaining = remaining.filter((item) => item.queueId !== entry.queueId);
            await persistPendingSales(remaining);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'sync error';
            remaining = remaining.map((item) =>
              item.queueId === entry.queueId ? applySyncFailure(item, message, Date.now()) : item,
            );
            await persistPendingSales(remaining);
          }
        }

        // Preserved: the original called refreshDaySummary() unconditionally
        // after the loop ran (not only when synced > 0).
        await refreshDaySummary();

        return { synced, remaining: remaining.length, skipped: false };
      } finally {
        setSyncing(false);
      }
    },
    [token, pendingSales, trySendSale, trySendEmptyVisit, persistPendingSales, refreshDaySummary],
  );

  // Preserved verbatim: interval torn down and recreated on every queue
  // mutation (dependency array is `[pendingSales]`, not the sync callback) —
  // this is the exact behavior flagged as highest-risk in the design.
  useEffect(() => {
    const interval = setInterval(() => {
      void syncPendingSales(false);
    }, AUTO_SYNC_INTERVAL_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: resubscribe only on queue mutation
  }, [pendingSales]);

  const value = useMemo<SyncContextValue>(
    () => ({
      pendingSales,
      syncing,
      daySummary,
      summaryLoading,
      summaryError,
      assignedTruckCode,
      trySendSale,
      enqueueSale,
      trySendEmptyVisit,
      enqueueEmptyVisit,
      syncPendingSales,
      refreshDaySummary,
    }),
    [
      pendingSales,
      syncing,
      daySummary,
      summaryLoading,
      summaryError,
      assignedTruckCode,
      trySendSale,
      enqueueSale,
      trySendEmptyVisit,
      enqueueEmptyVisit,
      syncPendingSales,
      refreshDaySummary,
    ],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }

  return context;
}
