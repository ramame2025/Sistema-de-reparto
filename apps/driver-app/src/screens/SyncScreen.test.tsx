jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../context/SyncContext', () => {
  const actual = jest.requireActual('../context/SyncContext');
  return {
    ...actual,
    useSync: jest.fn(),
  };
});

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { SyncScreen } from './SyncScreen';
import { useSync } from '../context/SyncContext';

const mockedUseSync = useSync as jest.Mock;

const baseSyncValue = {
  pendingSales: [],
  syncing: false,
  daySummary: { activeCount: 0, canceledCount: 0, activeTotal: 0 },
  summaryLoading: false,
  summaryError: null,
  fallbackTruckCode: 'CAMION-01',
  setFallbackTruckCode: jest.fn(),
  trySendSale: jest.fn(),
  enqueueSale: jest.fn(),
  syncPendingSales: jest.fn(),
  refreshDaySummary: jest.fn().mockResolvedValue(undefined),
};

const freshEntry = {
  queueId: 'q1',
  payload: { customerName: 'Kiosco Norte' },
  createdAt: '2026-08-17T10:00:00.000Z',
  retries: 0,
  nextRetryAt: Date.now(),
};

const strugglingEntry = {
  queueId: 'q2',
  payload: { customerName: 'Almacen Sur' },
  createdAt: '2026-08-17T09:00:00.000Z',
  retries: 3,
  nextRetryAt: Date.now() + 40000,
  lastError: 'API 500',
};

describe('SyncScreen/empty', () => {
  it('renders a dedicated empty state when there are zero pending sales', async () => {
    mockedUseSync.mockReturnValue({ ...baseSyncValue, pendingSales: [] });

    await render(<SyncScreen />);

    expect(screen.getByText('No hay ventas pendientes')).toBeTruthy();
    expect(screen.getByTestId('empty-state-description')).toBeTruthy();
    expect(screen.queryByText('Kiosco Norte')).toBeNull();
  });
});

describe('SyncScreen/populated', () => {
  it('renders each queued sale with its queued time and retry count', async () => {
    mockedUseSync.mockReturnValue({
      ...baseSyncValue,
      pendingSales: [freshEntry],
    });

    await render(<SyncScreen />);

    expect(screen.getByText('Kiosco Norte')).toBeTruthy();
    expect(
      screen.getByText(`En cola desde: ${new Date(freshEntry.createdAt).toLocaleTimeString('es-AR')}`),
    ).toBeTruthy();
    expect(screen.getByText('Intentos: 0')).toBeTruthy();
    expect(screen.queryByText('API 500')).toBeNull();
  });

  it('renders the last error for an entry that has failed at least once, distinct from a fresh entry', async () => {
    mockedUseSync.mockReturnValue({
      ...baseSyncValue,
      pendingSales: [freshEntry, strugglingEntry],
    });

    await render(<SyncScreen />);

    expect(screen.getByText('Almacen Sur')).toBeTruthy();
    expect(screen.getByText('Intentos: 3')).toBeTruthy();
    expect(screen.getByText('API 500')).toBeTruthy();
    // The fresh entry still has no error line — proves the error line is per-entry, not global.
    expect(screen.getByText('Intentos: 0')).toBeTruthy();
  });
});

describe('SyncScreen/manual retry', () => {
  it('calls syncPendingSales(true) and shows a success message when the retry clears the queue', async () => {
    const syncPendingSales = jest
      .fn()
      .mockResolvedValue({ synced: 1, remaining: 0, skipped: false });
    mockedUseSync.mockReturnValue({
      ...baseSyncValue,
      pendingSales: [freshEntry],
      syncPendingSales,
    });

    await render(<SyncScreen />);

    await fireEvent.press(screen.getByTestId('sync-retry-button'));

    await waitFor(() => expect(syncPendingSales).toHaveBeenCalledWith(true));
    expect(screen.getByText('Sincronizacion finalizada. Enviadas: 1. Pendientes: 0.')).toBeTruthy();
  });

  it('disables the retry button while syncing is true', async () => {
    mockedUseSync.mockReturnValue({
      ...baseSyncValue,
      pendingSales: [freshEntry],
      syncing: true,
    });

    await render(<SyncScreen />);

    const button = screen.getByTestId('sync-retry-button');
    expect(button.props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Sincronizando...')).toBeTruthy();
  });

  it('shows a distinct error message when the retry call rejects', async () => {
    const syncPendingSales = jest.fn().mockRejectedValue(new Error('network down'));
    mockedUseSync.mockReturnValue({
      ...baseSyncValue,
      pendingSales: [freshEntry],
      syncPendingSales,
    });

    await render(<SyncScreen />);

    await fireEvent.press(screen.getByTestId('sync-retry-button'));

    await waitFor(() =>
      expect(screen.getByText('No se pudo sincronizar la cola offline.')).toBeTruthy(),
    );
  });
});

describe('SyncScreen/no discard control', () => {
  it('never renders a delete/discard action for any queued entry — retry is the only action', async () => {
    mockedUseSync.mockReturnValue({
      ...baseSyncValue,
      pendingSales: [freshEntry, strugglingEntry],
    });

    await render(<SyncScreen />);

    // Proves an ABSENCE: no label anywhere on the screen matches a
    // delete/discard/eliminar-type action, for any queued entry.
    expect(screen.queryAllByText(/eliminar|borrar|descartar|delete|discard/i)).toHaveLength(0);
    expect(screen.queryAllByTestId(/eliminar|borrar|descartar|delete|discard/i)).toHaveLength(0);
  });
});
