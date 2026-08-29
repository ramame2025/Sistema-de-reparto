jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../context/TruckContext', () => {
  const actual = jest.requireActual('../context/TruckContext');
  return { ...actual, useTruck: jest.fn() };
});

jest.mock('../context/SyncContext', () => {
  const actual = jest.requireActual('../context/SyncContext');
  return { ...actual, useSync: jest.fn() };
});

jest.mock('../context/CatalogContext', () => {
  const actual = jest.requireActual('../context/CatalogContext');
  return { ...actual, useCatalog: jest.fn() };
});

jest.mock('../context/AuthContext', () => {
  const actual = jest.requireActual('../context/AuthContext');
  return { ...actual, useAuth: jest.fn() };
});

const mockedNavigate = jest.fn();
const mockedParentNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: mockedNavigate,
      getParent: () => ({ navigate: mockedParentNavigate }),
    }),
  };
});

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import type { LoadManifestRecord, PriceTable, SaleRecord } from '@distribuidor/shared';
import { HomeScreen } from './HomeScreen';
import { useAuth } from '../context/AuthContext';
import { useCatalog } from '../context/CatalogContext';
import { useSync } from '../context/SyncContext';
import { useTruck } from '../context/TruckContext';

const mockedUseAuth = useAuth as jest.Mock;
const mockedUseSync = useSync as jest.Mock;
const mockedUseTruck = useTruck as jest.Mock;
const mockedUseCatalog = useCatalog as jest.Mock;
let mockedApiGet: jest.Mock;
let mockedLogout: jest.Mock;

const prices: PriceTable = {
  final: { G10: 8500 },
  comercio: { G10: 8200 },
  distribuidor: { G10: 7900 },
};

const today = () => new Date().toISOString().slice(0, 10);

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

const baseSyncValue = {
  pendingSales: [],
  syncing: false,
  daySummary: { activeCount: 0, canceledCount: 0, activeTotal: 0 },
  todaySales: [] as SaleRecord[],
  summaryLoading: false,
  summaryError: null,
  assignedTruckCode: 'CAMION-01',
  trySendSale: jest.fn(),
  enqueueSale: jest.fn(),
  syncPendingSales: jest.fn(),
  refreshDaySummary: jest.fn().mockResolvedValue(undefined),
};

const syncWith = (overrides: Record<string, unknown> = {}) =>
  mockedUseSync.mockReturnValue({ ...baseSyncValue, ...overrides });

const buildSale = (overrides: Partial<SaleRecord> = {}): SaleRecord => ({
  id: 's1',
  createdAt: `${today()}T14:30:00.000Z`,
  occurredAt: `${today()}T14:30:00.000Z`,
  status: 'active',
  driverName: 'chofer1',
  total: 96000,
  customerName: 'Distribuidora Sur',
  customerType: 'comercio',
  paymentMethod: 'efectivo',
  items: [],
  kind: 'sale',
  ...overrides,
});

const manifestToday = (overrides: Partial<LoadManifestRecord> = {}): LoadManifestRecord => ({
  id: 'm1',
  createdAt: `${today()}T07:10:00.000Z`,
  driverName: 'chofer1',
  truckId: 'truck-1',
  items: [
    { productCode: 'G10', quantity: 50 },
    { productCode: 'G15', quantity: 21 },
  ],
  ...overrides,
});

/** Rutea las tres llamadas que la portada hace al montarse. */
const apiReturning = (options: { manifests?: unknown; customers?: unknown } = {}) =>
  jest.fn().mockImplementation((path: string) => {
    if (path.startsWith('/load-manifests/mine')) {
      return Promise.resolve(options.manifests ?? []);
    }
    if (path.startsWith('/driver-customer-assignments/me')) {
      return Promise.resolve(options.customers ?? { date: today(), customers: [] });
    }
    return Promise.resolve([]);
  });

beforeEach(() => {
  mockedUseTruck.mockReturnValue(baseTruckValue);
  mockedUseCatalog.mockReturnValue({ products: [], prices, stale: false, canSell: true });
  mockedNavigate.mockClear();
  mockedParentNavigate.mockClear();
  mockedApiGet = apiReturning();
  mockedLogout = jest.fn();
  syncWith();
  mockedUseAuth.mockReturnValue({
    status: 'authenticated' as const,
    token: 'tok',
    username: 'chofer1',
    loading: false,
    api: { get: mockedApiGet },
    login: jest.fn(),
    logout: mockedLogout,
    requireAuthToken: jest.fn(() => 'tok'),
  });
});

describe('HomeScreen/encabezado de la jornada', () => {
  it('names the driver and the truck as soon as the app opens', async () => {
    await render(<HomeScreen />);

    expect(screen.getByText('chofer1 · CAMION-01')).toBeTruthy();
    expect(screen.getByText('AB123CD · 40 u. de capacidad')).toBeTruthy();
  });

  it('marks a cobertura explicitly, so the driver notices it is not his usual truck', async () => {
    mockedUseTruck.mockReturnValue({
      ...baseTruckValue,
      truck: { ...baseTruckValue.truck, kind: 'cobertura' as const },
    });

    await render(<HomeScreen />);

    expect(screen.getByText('AB123CD · 40 u. de capacidad · cobertura')).toBeTruthy();
  });

  it('says plainly when there is no truck for today', async () => {
    mockedUseTruck.mockReturnValue({ ...baseTruckValue, truck: null });

    await render(<HomeScreen />);

    expect(screen.getByTestId('jornada-header-no-truck')).toBeTruthy();
  });
});

describe('HomeScreen/carga y error del resumen', () => {
  it('refreshes on mount and shows an indicator while the summary is in flight', async () => {
    const refreshDaySummary = jest.fn().mockResolvedValue(undefined);
    syncWith({ summaryLoading: true, refreshDaySummary });

    await render(<HomeScreen />);

    expect(screen.getByTestId('home-summary-loading')).toBeTruthy();
    expect(refreshDaySummary).toHaveBeenCalledTimes(1);
  });

  it('renders a visible error instead of a silently stale summary', async () => {
    syncWith({ summaryError: 'No se pudo actualizar el resumen.' });

    await render(<HomeScreen />);

    expect(screen.getByText('No se pudo actualizar el resumen.')).toBeTruthy();
    expect(screen.queryByTestId('home-day-status')).toBeNull();
  });

  it('reloads everything on pull-to-refresh, replacing the old refresh button', async () => {
    const refreshDaySummary = jest.fn().mockResolvedValue(undefined);
    syncWith({ refreshDaySummary });

    await render(<HomeScreen />);
    await waitFor(() => expect(refreshDaySummary).toHaveBeenCalledTimes(1));

    screen.getByTestId('home-screen-scroll').props.refreshControl.props.onRefresh();

    await waitFor(() => expect(refreshDaySummary).toHaveBeenCalledTimes(2));
    // Las tres fuentes de la portada, no solo el resumen.
    expect(mockedApiGet.mock.calls.filter((c) => String(c[0]).startsWith('/load-manifests'))).toHaveLength(2);
  });
});

describe('HomeScreen/estado de la jornada', () => {
  it('reports a clean day when nothing is queued and nothing lacks a proof', async () => {
    syncWith({ daySummary: { activeCount: 13, canceledCount: 0, activeTotal: 197500 } });

    await render(<HomeScreen />);

    expect(screen.getByText('Todo en orden')).toBeTruthy();
    expect(screen.getByTestId('day-status-detail')).toHaveTextContent(
      '13 ventas enviadas · nada en cola',
    );
  });

  it('counts a queued sale and a proofless card payment as one problem each', async () => {
    syncWith({
      daySummary: { activeCount: 12, canceledCount: 1, activeTotal: 184500 },
      pendingSales: [
        {
          queueId: 'q1',
          kind: 'sale',
          retries: 3,
          nextRetryAt: 0,
          createdAt: `${today()}T10:00:00.000Z`,
          payload: {
            driverName: 'chofer1',
            customerName: 'Kiosco La Esquina',
            customerType: 'comercio',
            paymentMethod: 'efectivo',
            items: [{ productCode: 'G10', quantity: 1 }],
          },
        },
      ],
      todaySales: [buildSale({ id: 's-transfer', paymentMethod: 'transferencia' })],
    });

    await render(<HomeScreen />);

    expect(screen.getByText('2 ventas con problema')).toBeTruthy();
    expect(screen.getByTestId('day-status-problem-q1-reason')).toHaveTextContent(
      'No se pudo enviar · 3 intentos',
    );
    expect(screen.getByTestId('day-status-problem-s-transfer-reason')).toHaveTextContent(
      'Falta el comprobante de la transferencia',
    );
  });

  it('sends an unsent sale to the sync queue, which is where it gets retried', async () => {
    syncWith({
      pendingSales: [
        {
          queueId: 'q1',
          kind: 'sale',
          retries: 1,
          nextRetryAt: 0,
          createdAt: `${today()}T10:00:00.000Z`,
          payload: {
            driverName: 'chofer1',
            customerName: 'Kiosco La Esquina',
            customerType: 'comercio',
            paymentMethod: 'efectivo',
            items: [],
          },
        },
      ],
    });

    await render(<HomeScreen />);
    await fireEvent.press(screen.getByTestId('day-status-problem-q1'));

    expect(mockedParentNavigate).toHaveBeenCalledWith('Sincronización');
  });

  it('opens the sale itself when what is missing is its proof', async () => {
    const sale = buildSale({ id: 's-transfer', paymentMethod: 'transferencia' });
    syncWith({ todaySales: [sale] });

    await render(<HomeScreen />);
    await fireEvent.press(screen.getByTestId('day-status-problem-s-transfer'));

    expect(mockedNavigate).toHaveBeenCalledWith('SaleDetail', { sale });
  });

  it('sends "Resolver ahora" to the sale that could still be lost, ahead of the rest', async () => {
    syncWith({
      pendingSales: [
        {
          queueId: 'q1',
          kind: 'sale',
          retries: 1,
          nextRetryAt: 0,
          createdAt: `${today()}T10:00:00.000Z`,
          payload: {
            driverName: 'chofer1',
            customerName: 'Kiosco',
            customerType: 'comercio',
            paymentMethod: 'efectivo',
            items: [],
          },
        },
      ],
      todaySales: [buildSale({ id: 's-transfer', paymentMethod: 'transferencia' })],
    });

    await render(<HomeScreen />);
    await fireEvent.press(screen.getByTestId('day-status-resolve'));

    // Una venta que el servidor no tiene se pierde con el telefono; una sin
    // comprobante ya esta guardada.
    expect(mockedParentNavigate).toHaveBeenCalledWith('Sincronización');
    expect(mockedNavigate).not.toHaveBeenCalledWith('SaleDetail', expect.anything());
  });
});

describe('HomeScreen/cobrado hoy', () => {
  it('shows the amount charged and the three counters', async () => {
    syncWith({
      daySummary: { activeCount: 12, canceledCount: 1, activeTotal: 184500 },
      pendingSales: [{ queueId: 'q1' }, { queueId: 'q2' }],
    });

    await render(<HomeScreen />);

    expect(screen.getByTestId('home-cobrado-hoy')).toHaveTextContent('$184.500');
    expect(screen.getByTestId('home-tile-activas-value')).toHaveTextContent('12');
    expect(screen.getByTestId('home-tile-anuladas-value')).toHaveTextContent('1');
    expect(screen.getByTestId('home-tile-cola-value')).toHaveTextContent('2');
  });

  it('navigates to the full sales list', async () => {
    await render(<HomeScreen />);
    await fireEvent.press(screen.getByTestId('home-sales-history-cta'));

    expect(mockedNavigate).toHaveBeenCalledWith('SalesHistory');
  });
});

describe('HomeScreen/remito', () => {
  it('fetches the manifest on mount and counts the units it carried', async () => {
    mockedApiGet = apiReturning({ manifests: [manifestToday()] });
    mockedUseAuth.mockReturnValue({
      status: 'authenticated' as const,
      token: 'tok',
      username: 'chofer1',
      loading: false,
      api: { get: mockedApiGet },
      login: jest.fn(),
      logout: mockedLogout,
      requireAuthToken: jest.fn(() => 'tok'),
    });

    await render(<HomeScreen />);

    await waitFor(() =>
      expect(screen.getByText('Remito cargado · 71 envases')).toBeTruthy(),
    );
    expect(mockedApiGet).toHaveBeenCalledWith('/load-manifests/mine', { cache: 'no-store' });
  });

  it('prompts to load the truck when today has no manifest, explaining why it matters', async () => {
    await render(<HomeScreen />);

    await waitFor(() => expect(screen.getByTestId('home-manifest-missing')).toBeTruthy());
    expect(screen.getByText('Cargá el camión para que cierren los números')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('home-manifest-missing'));
    expect(mockedNavigate).toHaveBeenCalledWith('LoadManifest');
  });

  it('ignores a manifest from another day when deciding what to show', async () => {
    mockedApiGet = apiReturning({
      manifests: [manifestToday({ createdAt: '2020-01-01T07:10:00.000Z' })],
    });
    mockedUseAuth.mockReturnValue({
      status: 'authenticated' as const,
      token: 'tok',
      username: 'chofer1',
      loading: false,
      api: { get: mockedApiGet },
      login: jest.fn(),
      logout: mockedLogout,
      requireAuthToken: jest.fn(() => 'tok'),
    });

    await render(<HomeScreen />);

    await waitFor(() => expect(screen.getByTestId('home-manifest-missing')).toBeTruthy());
  });

  it('shows a visible error when the manifest fetch fails, without blocking the rest', async () => {
    mockedApiGet = jest.fn().mockImplementation((path: string) => {
      if (path.startsWith('/load-manifests/mine')) {
        return Promise.reject(new Error('No se pudo verificar el remito de hoy.'));
      }
      return Promise.resolve({ date: today(), customers: [] });
    });
    mockedUseAuth.mockReturnValue({
      status: 'authenticated' as const,
      token: 'tok',
      username: 'chofer1',
      loading: false,
      api: { get: mockedApiGet },
      login: jest.fn(),
      logout: mockedLogout,
      requireAuthToken: jest.fn(() => 'tok'),
    });

    await render(<HomeScreen />);

    await waitFor(() => expect(screen.getByTestId('home-manifest-error')).toBeTruthy());
    expect(screen.getByTestId('home-cobrado-hoy')).toBeTruthy();
  });
});

describe('HomeScreen/clientes de hoy', () => {
  const withCustomers = (ids: string[], todaySales: SaleRecord[] = []) => {
    mockedApiGet = apiReturning({
      customers: { date: today(), customers: ids.map((id) => ({ id, name: id })) },
    });
    mockedUseAuth.mockReturnValue({
      status: 'authenticated' as const,
      token: 'tok',
      username: 'chofer1',
      loading: false,
      api: { get: mockedApiGet },
      login: jest.fn(),
      logout: mockedLogout,
      requireAuthToken: jest.fn(() => 'tok'),
    });
    syncWith({ todaySales });
  };

  it('counts how many of the assigned customers were already visited', async () => {
    withCustomers(
      ['c1', 'c2', 'c3'],
      [buildSale({ id: 'a', customerId: 'c1' }), buildSale({ id: 'b', customerId: 'c2' })],
    );

    await render(<HomeScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('home-clients-progress')).toHaveTextContent('2 de 3 visitados'),
    );
  });

  it('fetches the assignment for today, scoped to the local day', async () => {
    withCustomers(['c1']);

    await render(<HomeScreen />);

    await waitFor(() =>
      expect(mockedApiGet).toHaveBeenCalledWith(
        expect.stringContaining('/driver-customer-assignments/me?date='),
        { cache: 'no-store' },
      ),
    );
  });

  it('reads zero of zero rather than crashing when nothing is assigned', async () => {
    withCustomers([]);

    await render(<HomeScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('home-clients-progress')).toHaveTextContent('0 de 0 visitados'),
    );
  });

  it('shows a visible error when the assignment fetch fails, without blocking the rest', async () => {
    mockedApiGet = jest.fn().mockImplementation((path: string) => {
      if (path.startsWith('/driver-customer-assignments/me')) {
        return Promise.reject(new Error('No se pudo verificar tus clientes de hoy.'));
      }
      return Promise.resolve([]);
    });
    mockedUseAuth.mockReturnValue({
      status: 'authenticated' as const,
      token: 'tok',
      username: 'chofer1',
      loading: false,
      api: { get: mockedApiGet },
      login: jest.fn(),
      logout: mockedLogout,
      requireAuthToken: jest.fn(() => 'tok'),
    });

    await render(<HomeScreen />);

    await waitFor(() => expect(screen.getByTestId('home-assigned-customers-error')).toBeTruthy());
    expect(screen.getByTestId('home-cobrado-hoy')).toBeTruthy();
  });

  it('navigates to the assigned-customers list', async () => {
    await render(<HomeScreen />);
    await fireEvent.press(screen.getByTestId('home-assigned-customers-cta'));

    expect(mockedNavigate).toHaveBeenCalledWith('AssignedCustomers');
  });
});

describe('HomeScreen/logout', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows a logout control tied to the current username', async () => {
    await render(<HomeScreen />);

    expect(screen.getByText('Sesión de chofer1')).toBeTruthy();
    expect(screen.getByTestId('home-logout-button')).toBeTruthy();
  });

  it('asks for confirmation and only calls logout() once the driver confirms', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    await render(<HomeScreen />);
    await fireEvent.press(screen.getByTestId('home-logout-button'));

    const [, , buttons] = alertSpy.mock.calls[0];
    expect(mockedLogout).not.toHaveBeenCalled();

    (buttons as { text: string; onPress?: () => void }[])
      .find((button) => button.text === 'Cerrar sesión')
      ?.onPress?.();

    expect(mockedLogout).toHaveBeenCalledTimes(1);
  });

  it('does not call logout() when the confirmation is dismissed', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    await render(<HomeScreen />);
    await fireEvent.press(screen.getByTestId('home-logout-button'));

    const [, , buttons] = alertSpy.mock.calls[0];
    (buttons as { text: string; onPress?: () => void }[])
      .find((button) => button.text === 'Cancelar')
      ?.onPress?.();

    expect(mockedLogout).not.toHaveBeenCalled();
  });

  it('warns about unsynced sales, which a logout would strand on this phone', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    syncWith({ pendingSales: [{ queueId: 'q1' }, { queueId: 'q2' }] });

    await render(<HomeScreen />);
    await fireEvent.press(screen.getByTestId('home-logout-button'));

    expect(String(alertSpy.mock.calls[0][1])).toContain('2 ventas sin sincronizar');
  });

  it('does not mention unsynced sales when the queue is empty', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    await render(<HomeScreen />);
    await fireEvent.press(screen.getByTestId('home-logout-button'));

    expect(String(alertSpy.mock.calls[0][1])).not.toContain('sin sincronizar');
  });
});
