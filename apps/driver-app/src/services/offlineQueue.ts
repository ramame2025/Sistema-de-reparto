import type { CreateSaleInput } from '@distribuidor/shared';

const BASE_BACKOFF_MS = 5000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

export const computeBackoff = (retries: number): number =>
  Math.min(BASE_BACKOFF_MS * 2 ** retries, MAX_BACKOFF_MS);

export type PendingSale = {
  queueId: string;
  payload: CreateSaleInput;
  createdAt: string;
  retries: number;
  nextRetryAt: number;
  lastError?: string;
};

/**
 * Whether a queued entry should be attempted right now.
 * Manual retries always run; automatic retries wait for `nextRetryAt`.
 */
export const isDue = (entry: PendingSale, now: number, manual: boolean): boolean =>
  manual || entry.nextRetryAt <= now;

/**
 * Returns a new entry reflecting a failed sync attempt.
 * NOTE: the backoff is computed from `entry.retries + 1` (the value BEFORE
 * increment, offset by one) — this preserves the exact call-site behavior of
 * the original inline sync loop (`computeBackoff(item.retries + 1)`), which
 * is numerically equal to the new `retries` value stored on the result.
 */
export const applySyncFailure = (
  entry: PendingSale,
  errorMessage: string,
  now: number = Date.now(),
): PendingSale => ({
  ...entry,
  retries: entry.retries + 1,
  nextRetryAt: now + computeBackoff(entry.retries + 1),
  lastError: errorMessage,
});

export const normalizePendingSalePayload = (
  payload: CreateSaleInput,
  fallbackDriverName: string,
  fallbackTruckCode: string,
): CreateSaleInput => ({
  ...payload,
  driverName: payload.driverName?.trim() || fallbackDriverName,
  truckCode: payload.truckCode?.trim() || fallbackTruckCode || undefined,
});
