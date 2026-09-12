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
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react-native';
import type { MyTruckStockResponse, PriceTable, SaleRecord } from '@distribuidor/shared';
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
    capacities: [{ productCode: 'G10', units: 30 }],
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

const stockToday = (overrides: Partial<MyTruckStockResponse['stock']> = {}): MyTruckStockResponse => ({
  date: today(),
  stock: {
    truckId: 'truck-1',
    date: today(),
    manifestAt: `${today()}T07:10:00.000Z`,
    lines: [
      { productCode: 'G10', loaded: 50, sold: 38, remaining: 12 },
      { productCode: 'G15', loaded: 21, sold: 12, remaining: 9 },
    ],
    ...overrides,
  },
});

const noStockToday = (): MyTruckStockResponse => ({
  date: today(),
  stock: { truckId: 'truck-1', date: today(), manifestAt: null, lines: [] },
});

/** Rutea las tres llamadas que la portada hace al montarse. */
const apiReturning = (options: { stock?: unknown; customers?: unknown } = {}) =>
  jest.fn().mockImplementation((path: string) => {
    if (path.startsWith('/load-manifests/my-stock')) {
      return Promise.resolve(options.stock ?? noStockToday());
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
    expect(screen.getByText('AB123CD')).toBeTruthy();
  });

  // La capacidad ya no es un total: es una grilla por producto, y se lee en el
  // remito, al lado de lo que el chofer esta cargando.
  it('keeps the capacity out of the header now that it is per product', async () => {
    await render(<HomeScreen />);

    expect(screen.queryByText(/capacidad/i)).toBeNull();
  });

  it('marks a cobertura explicitly, so the driver notices it is not his usual truck', async () => {
    mockedUseTruck.mockReturnValue({
      ...baseTruckValue,
      truck: { ...baseTruckValue.truck, kind: 'cobertura' as const },
    });

    await render(<HomeScreen />);

    expect(screen.getByText('AB123CD · cobertura')).toBeTruthy();
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

describe('HomeScreen/en el camion', () => {
  const withApi = (get: jest.Mock) => {
    mockedApiGet = get;
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
  };

  it('asks the server what is left on the truck today, not for the raw manifest list', async () => {
    withApi(apiReturning({ stock: stockToday() }));

    await render(<HomeScreen />);

    await waitFor(() =>
      expect(mockedApiGet).toHaveBeenCalledWith(
        `/load-manifests/my-stock?date=${today()}`,
        { cache: 'no-store' },
      ),
    );
  });

  it('leads with what is still on board, backed by the manifest it came from', async () => {
    withApi(apiReturning({ stock: stockToday() }));

    await render(<HomeScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('home-truck-stock-remaining-total')).toHaveTextContent('quedan 21'),
    );
    expect(screen.getByTestId('home-truck-stock-header-subtitle')).toHaveTextContent(/71 cargados$/);
  });

  it('subtracts sales still queued on this phone, so the count survives a dead signal', async () => {
    syncWith({
      pendingSales: [
        {
          queueId: 'q1',
          kind: 'sale',
          payload: { customerType: 'comercio', items: [{ productCode: 'G10', quantity: 4 }] },
          createdAt: `${today()}T12:00:00.000Z`,
          retries: 0,
          nextRetryAt: 0,
        },
      ] as never,
    });
    withApi(apiReturning({ stock: stockToday() }));

    await render(<HomeScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('home-truck-stock-tile-G10-value')).toHaveTextContent('8'),
    );
    // Lo cargado no lo toca la cola: solo cambia lo que queda.
    expect(screen.getByTestId('home-truck-stock-tile-G10-loaded')).toHaveTextContent('/50');
  });

  it('prompts to load the truck when today has no manifest, explaining why it matters', async () => {
    await render(<HomeScreen />);

    await waitFor(() => expect(screen.getByTestId('home-truck-stock-load-cta')).toBeTruthy());
    expect(screen.getByText('Sin remito no sabemos qué te queda')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('home-truck-stock-load-cta'));
    expect(mockedNavigate).toHaveBeenCalledWith('LoadManifest');
  });

  it('opens the manifest history from the loaded card', async () => {
    withApi(apiReturning({ stock: stockToday() }));

    await render(<HomeScreen />);
    await waitFor(() => expect(screen.getByTestId('home-truck-stock-remaining-total')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('home-truck-stock'));
    expect(mockedNavigate).toHaveBeenCalledWith('ManifestHistory');
  });

  it('shows a visible error when the stock fetch fails, without blocking the rest', async () => {
    withApi(
      jest.fn().mockImplementation((path: string) => {
        if (path.startsWith('/load-manifests/my-stock')) {
          return Promise.reject(new Error('No se pudo verificar el remito de hoy.'));
        }
        return Promise.resolve({ date: today(), customers: [] });
      }),
    );

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
  /**
   * Cerrar sesion dejo de vivir al pie del scroll de Inicio: ahora esta en el
   * menu del chofer, detras del boton de la barra.
   */
  const openMenu = async () => {
    await fireEvent.press(screen.getByTestId('jornada-header-menu'));
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps logout reachable, behind the menu button on the bar', async () => {
    await render(<HomeScreen />);

    expect(screen.queryByTestId('driver-menu-logout')).toBeNull();

    await openMenu();

    expect(screen.getByTestId('driver-menu-logout')).toBeTruthy();
    expect(within(screen.getByTestId('home-driver-menu')).getByText('chofer1')).toBeTruthy();
  });

  it('asks for confirmation and only calls logout() once the driver confirms', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    await render(<HomeScreen />);
    await openMenu();
    await fireEvent.press(screen.getByTestId('driver-menu-logout'));

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
    await openMenu();
    await fireEvent.press(screen.getByTestId('driver-menu-logout'));

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
    await openMenu();
    await fireEvent.press(screen.getByTestId('driver-menu-logout'));

    expect(String(alertSpy.mock.calls[0][1])).toContain('2 ventas sin sincronizar');
  });

  it('does not mention unsynced sales when the queue is empty', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    await render(<HomeScreen />);
    await openMenu();
    await fireEvent.press(screen.getByTestId('driver-menu-logout'));

    expect(String(alertSpy.mock.calls[0][1])).not.toContain('sin sincronizar');
  });
});

describe('HomeScreen/encabezados', () => {
  it('gives the three cards of the day one and the same header, so none outranks another', async () => {
    mockedApiGet = jest.fn().mockImplementation((path: string) => {
      if (path.startsWith('/load-manifests/my-stock')) {
        return Promise.resolve({
          date: today(),
          stock: {
            truckId: 'truck-1',
            date: today(),
            manifestAt: `${today()}T07:10:00.000Z`,
            lines: [{ productCode: 'G10', loaded: 50, sold: 38, remaining: 12 }],
          },
        });
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

    await waitFor(() =>
      expect(screen.getByTestId('home-truck-stock-header-title')).toHaveTextContent('En el camión'),
    );
    expect(screen.getByTestId('home-cobrado-header-title')).toHaveTextContent('Cobrado hoy');
    expect(screen.getByTestId('home-clients-header-title')).toHaveTextContent('Clientes de hoy');

    const sizeOf = (testID: string) => {
      const style = screen.getByTestId(testID).props.style;
      return (Array.isArray(style) ? Object.assign({}, ...style.flat()) : style).fontSize;
    };
    const sizes = [
      'home-cobrado-header-title',
      'home-truck-stock-header-title',
      'home-clients-header-title',
    ].map(sizeOf);

    expect(new Set(sizes).size).toBe(1);
  });
});
