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
import { HomeScreen } from './HomeScreen';
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

describe('HomeScreen/loading', () => {
  it('renders a loading indicator while summaryLoading is true and refreshes on mount', async () => {
    const refreshDaySummary = jest.fn().mockResolvedValue(undefined);
    mockedUseSync.mockReturnValue({ ...baseSyncValue, summaryLoading: true, refreshDaySummary });

    await render(<HomeScreen />);

    expect(screen.getByTestId('home-summary-loading')).toBeTruthy();
    expect(screen.queryByText(/Ventas activas hoy/)).toBeNull();
    expect(screen.queryByTestId('empty-state-description')).toBeNull();
    await waitFor(() => expect(refreshDaySummary).toHaveBeenCalledTimes(1));
  });
});

describe('HomeScreen/error', () => {
  it('renders a visible error message when summaryError is set', async () => {
    mockedUseSync.mockReturnValue({
      ...baseSyncValue,
      summaryError: 'No se pudo actualizar el resumen.',
    });

    await render(<HomeScreen />);

    expect(screen.getByText('No se pudo actualizar el resumen.')).toBeTruthy();
    expect(screen.queryByText(/Ventas activas hoy/)).toBeNull();
  });
});

describe('HomeScreen/empty', () => {
  it('renders a distinct empty state when there are zero sales today', async () => {
    mockedUseSync.mockReturnValue({
      ...baseSyncValue,
      daySummary: { activeCount: 0, canceledCount: 0, activeTotal: 0 },
    });

    await render(<HomeScreen />);

    expect(screen.getByText('Sin ventas hoy')).toBeTruthy();
    expect(screen.queryByText(/Ventas activas hoy/)).toBeNull();
  });
});

describe('HomeScreen/success', () => {
  it('renders the populated day summary and the pending-sales indicator', async () => {
    mockedUseSync.mockReturnValue({
      ...baseSyncValue,
      daySummary: { activeCount: 3, canceledCount: 1, activeTotal: 15000 },
      pendingSales: [{ queueId: 'q1' }, { queueId: 'q2' }],
    });

    await render(<HomeScreen />);

    expect(screen.getByText('Ventas activas hoy: 3')).toBeTruthy();
    expect(screen.getByText('Ventas anuladas hoy: 1')).toBeTruthy();
    expect(screen.getByText('Total activo hoy: $15.000')).toBeTruthy();
    expect(screen.getByText('Pendientes de sincronizar: 2')).toBeTruthy();
  });
});

describe('HomeScreen/manual refresh', () => {
  it('calls refreshDaySummary again when the manual refresh button is pressed', async () => {
    const refreshDaySummary = jest.fn().mockResolvedValue(undefined);
    mockedUseSync.mockReturnValue({ ...baseSyncValue, refreshDaySummary });

    await render(<HomeScreen />);
    await waitFor(() => expect(refreshDaySummary).toHaveBeenCalledTimes(1));

    await fireEvent.press(screen.getByText('Actualizar resumen'));

    await waitFor(() => expect(refreshDaySummary).toHaveBeenCalledTimes(2));
  });
});
