import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PendingSale } from './offlineQueue';

/** Preserved verbatim from the current App.tsx implementation — do not rename. */
export const OFFLINE_QUEUE_KEY = 'driver_pending_sales_v1';

export const loadPendingSalesFromStorage = async (): Promise<PendingSale[]> => {
  const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
  return raw ? (JSON.parse(raw) as PendingSale[]) : [];
};

export const savePendingSalesToStorage = async (sales: PendingSale[]): Promise<void> => {
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(sales));
};
