jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../context/TruckContext', () => {
  const actual = jest.requireActual('../context/TruckContext');
  return {
    ...actual,
    useTruck: jest.fn(),
  };
});

jest.mock('../context/SyncContext', () => {
  const actual = jest.requireActual('../context/SyncContext');
  return {
    ...actual,
    useSync: jest.fn(),
  };
});

// PR5: HomeScreen now fetches manifest status via useAuth().api.get, and
// navigates to LoadManifest via useNavigation() — both mocked the same way
// TruckContext/SyncContext already are above (fully virtualized, no
// requireActual, so this file stays independent of the real navigation tree
// and AsyncStorage/fetch chains).
jest.mock('../context/AuthContext', () => {
  const actual = jest.requireActual('../context/AuthContext');
  return {
    ...actual,
    useAuth: jest.fn(),
  };
});

const mockedNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockedNavigate }),
  };
});

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { HomeScreen } from './HomeScreen';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { useTruck } from '../context/TruckContext';

const mockedUseAuth = useAuth as jest.Mock;
const mockedUseSync = useSync as jest.Mock;
const mockedUseTruck = useTruck as jest.Mock;
let mockedApiGet: jest.Mock;

const baseTruckValue = {
  truck: {
    assignmentId: 'a-1',
    kind: 'titular' as const,
    truckId: 'truck-1',
    code: 'CAMION-01',
    plate: 'AB123CD',
    capacity: 40,
    startDate: '2026-02-01T00:00:00.000Z',
    endDate: null,
  },
  date: '2026-02-11',
  status: 'ready' as const,
  error: null,
  reload: jest.fn(),
};

beforeEach(() => {
  mockedUseTruck.mockReturnValue(baseTruckValue);
  mockedNavigate.mockClear();
  mockedApiGet = jest.fn().mockResolvedValue([]);
  mockedUseAuth.mockReturnValue({
    status: 'authenticated' as const,
    token: 'tok',
    username: 'chofer1',
    loading: false,
    api: { get: mockedApiGet },
    login: jest.fn(),
    logout: jest.fn(),
    requireAuthToken: jest.fn(() => 'tok'),
  });
});

const baseSyncValue = {
  pendingSales: [],
  syncing: false,
  daySummary: { activeCount: 0, canceledCount: 0, activeTotal: 0 },
  summaryLoading: false,
  summaryError: null,
  assignedTruckCode: 'CAMION-01',
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

describe('HomeScreen/camion del dia', () => {
  it('shows the assigned truck as soon as the driver opens the app', async () => {
    await render(<HomeScreen />);

    expect(screen.getByTestId('home-assigned-truck')).toBeTruthy();
    expect(screen.getByText(/CAMION-01/)).toBeTruthy();
  });

  it('marks a cobertura explicitly, so the driver notices it is not his usual truck', async () => {
    mockedUseTruck.mockReturnValue({
      ...baseTruckValue,
      truck: { ...baseTruckValue.truck, kind: 'cobertura' as const, code: 'CAMION-09' },
    });

    await render(<HomeScreen />);

    expect(screen.getByText(/cobertura/i)).toBeTruthy();
  });

  it('says plainly when there is no truck for today', async () => {
    mockedUseTruck.mockReturnValue({ ...baseTruckValue, truck: null });

    await render(<HomeScreen />);

    expect(screen.getByTestId('home-no-truck')).toBeTruthy();
  });
});

describe('HomeScreen/manifest status banner (PR5)', () => {
  it('fetches manifest status on mount, alongside refreshDaySummary', async () => {
    const refreshDaySummary = jest.fn().mockResolvedValue(undefined);
    mockedUseSync.mockReturnValue({ ...baseSyncValue, refreshDaySummary });

    await render(<HomeScreen />);

    await waitFor(() => expect(refreshDaySummary).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mockedApiGet).toHaveBeenCalledWith('/load-manifests/mine', { cache: 'no-store' }),
    );
  });

  it('shows a passive banner when no manifest was submitted today', async () => {
    mockedApiGet.mockResolvedValue([]);

    await render(<HomeScreen />);

    await waitFor(() => expect(screen.getByTestId('home-manifest-missing')).toBeTruthy());
    expect(screen.queryByTestId('home-manifest-loaded')).toBeNull();
    expect(screen.queryByTestId('home-manifest-error')).toBeNull();
  });

  it('shows a different (positive) state when a manifest was already submitted today', async () => {
    const today = new Date().toISOString();
    mockedApiGet.mockResolvedValue([
      {
        id: 'm1',
        createdAt: today,
        driverName: 'chofer1',
        truckId: 'truck-1',
        items: [{ productCode: 'G10', quantity: 5 }],
      },
    ]);

    await render(<HomeScreen />);

    await waitFor(() => expect(screen.getByTestId('home-manifest-loaded')).toBeTruthy());
    expect(screen.queryByTestId('home-manifest-missing')).toBeNull();
  });

  it('ignores manifests from days other than today when deciding the banner', async () => {
    mockedApiGet.mockResolvedValue([
      {
        id: 'm0',
        createdAt: '2020-01-01T09:00:00.000Z',
        driverName: 'chofer1',
        truckId: 'truck-1',
        items: [{ productCode: 'G10', quantity: 5 }],
      },
    ]);

    await render(<HomeScreen />);

    await waitFor(() => expect(screen.getByTestId('home-manifest-missing')).toBeTruthy());
  });

  it('shows a visible error when the manifest fetch fails — no silent catch, same posture as summaryError', async () => {
    mockedApiGet.mockRejectedValue(new Error('No se pudo conectar con el servidor.'));

    await render(<HomeScreen />);

    await waitFor(() => expect(screen.getByTestId('home-manifest-error')).toBeTruthy());
    expect(screen.getByText('No se pudo conectar con el servidor.')).toBeTruthy();
    expect(screen.queryByTestId('home-manifest-missing')).toBeNull();
    expect(screen.queryByTestId('home-manifest-loaded')).toBeNull();
  });

  it('does not block the rest of the screen when the manifest fetch fails', async () => {
    mockedApiGet.mockRejectedValue(new Error('network down'));
    mockedUseSync.mockReturnValue({
      ...baseSyncValue,
      daySummary: { activeCount: 3, canceledCount: 1, activeTotal: 15000 },
    });

    await render(<HomeScreen />);

    await waitFor(() => expect(screen.getByTestId('home-manifest-error')).toBeTruthy());
    expect(screen.getByText('Ventas activas hoy: 3')).toBeTruthy();
  });

  it('navigates to LoadManifest when the CTA is pressed', async () => {
    mockedApiGet.mockResolvedValue([]);

    await render(<HomeScreen />);

    await waitFor(() => expect(screen.getByTestId('home-manifest-missing')).toBeTruthy());

    fireEvent.press(screen.getByTestId('home-manifest-cta'));

    expect(mockedNavigate).toHaveBeenCalledWith('LoadManifest');
  });
});
