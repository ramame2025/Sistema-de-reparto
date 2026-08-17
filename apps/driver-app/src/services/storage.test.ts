jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  OFFLINE_QUEUE_KEY,
  loadPendingSalesFromStorage,
  savePendingSalesToStorage,
} from './storage';
import type { PendingSale } from './offlineQueue';

const buildEntry = (queueId: string): PendingSale => ({
  queueId,
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
});

describe('storage/OFFLINE_QUEUE_KEY', () => {
  it('is the exact key used by the current App.tsx implementation', () => {
    expect(OFFLINE_QUEUE_KEY).toBe('driver_pending_sales_v1');
  });
});

describe('storage/loadPendingSalesFromStorage', () => {
  afterEach(async () => {
    await AsyncStorage.clear();
  });

  it('returns an empty array when nothing has been stored yet', async () => {
    const result = await loadPendingSalesFromStorage();
    expect(result).toEqual([]);
  });

  it('parses and returns previously stored entries under the exact key', async () => {
    const entries = [buildEntry('q_1'), buildEntry('q_2')];
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(entries));

    const result = await loadPendingSalesFromStorage();
    expect(result).toEqual(entries);
  });
});

describe('storage/savePendingSalesToStorage', () => {
  afterEach(async () => {
    await AsyncStorage.clear();
  });

  it('persists entries as JSON under the exact key', async () => {
    const entries = [buildEntry('q_1')];
    await savePendingSalesToStorage(entries);

    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    expect(JSON.parse(raw as string)).toEqual(entries);
  });
});
