jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

// MainTabs' "Inicio" tab now renders the real HomeScreen (PR6), which pulls
// in `useSync()`. bottom-tabs eagerly mounts only the initially-focused tab
// (Inicio, the first Tab.Screen), so HomeScreen actually renders in the
// "authenticated" tests below and needs a mocked SyncContext — fully
// virtualized (no requireActual) so the real module's AsyncStorage import
// chain never loads here, exactly like the AuthContext mock above.
jest.mock('../context/SyncContext', () => ({
  useSync: jest.fn(),
}));

// HomeScreen tambien muestra el camion asignado, asi que necesita TruckContext
// mockeado por la misma razon: mantener fuera la cadena de imports real.
jest.mock('../context/TruckContext', () => ({
  useTruck: jest.fn(),
}));

// HomeScreen valoriza las ventas encoladas con los precios del catalogo para
// listarlas como problemas, asi que necesita CatalogContext por el mismo
// motivo que los de arriba.
jest.mock('../context/CatalogContext', () => ({
  useCatalog: jest.fn(),
}));

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { RootNavigator } from './RootNavigator';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { useTruck } from '../context/TruckContext';
import { useCatalog } from '../context/CatalogContext';

const mockedUseAuth = useAuth as jest.Mock;
const mockedUseSync = useSync as jest.Mock;
const mockedUseTruck = useTruck as jest.Mock;

const baseAuthValue = {
  token: null,
  username: '',
  loading: false,
  // HomeScreen (PR5) now calls api.get('/load-manifests/mine') on mount
  // alongside refreshDaySummary — the "Inicio" tab is eagerly mounted by
  // bottom-tabs, so this needs a real jest.fn() here, not an empty object.
  api: { get: jest.fn().mockResolvedValue([]) },
  login: jest.fn(),
  logout: jest.fn(),
  requireAuthToken: jest.fn(() => null),
};

const baseSyncValue = {
  pendingSales: [],
  syncing: false,
  daySummary: { activeCount: 0, canceledCount: 0, activeTotal: 0 },
  todaySales: [],
  summaryLoading: false,
  summaryError: null,
  assignedTruckCode: 'CAMION-01',
  trySendSale: jest.fn(),
  enqueueSale: jest.fn(),
  syncPendingSales: jest.fn(),
  refreshDaySummary: jest.fn().mockResolvedValue(undefined),
};

beforeEach(() => {
  mockedUseSync.mockReturnValue(baseSyncValue);
  (useCatalog as jest.Mock).mockReturnValue({
    products: [],
    prices: null,
    stale: false,
    canSell: false,
  });
  mockedUseTruck.mockReturnValue({
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
    date: '2026-02-11',
    status: 'ready',
    error: null,
    reload: jest.fn(),
  });
});

describe('RootNavigator/checking', () => {
  it('renders a loading indicator while AuthContext.status is "checking"', async () => {
    mockedUseAuth.mockReturnValue({ ...baseAuthValue, status: 'checking' });

    await render(<RootNavigator />);

    expect(screen.getByTestId('root-navigator-loading')).toBeTruthy();
    expect(screen.queryByTestId('login-screen')).toBeNull();
    expect(screen.queryByTestId('main-tabs')).toBeNull();
  });
});

describe('RootNavigator/anonymous', () => {
  it('renders only the Auth Stack (Login screen) and no Main Tabs content', async () => {
    mockedUseAuth.mockReturnValue({ ...baseAuthValue, status: 'anonymous' });

    await render(<RootNavigator />);

    expect(screen.getByTestId('login-screen')).toBeTruthy();
    expect(screen.queryByText('Inicio')).toBeNull();
    expect(screen.queryByText('Nueva Venta')).toBeNull();
    expect(screen.queryByText('Gastos')).toBeNull();
    expect(screen.queryByText('Sincronización')).toBeNull();
  });
});

describe('RootNavigator/authenticated', () => {
  it('renders the Main Bottom Tabs and not the Login screen', async () => {
    mockedUseAuth.mockReturnValue({ ...baseAuthValue, status: 'authenticated', username: 'chofer1' });

    await render(<RootNavigator />);

    expect(screen.queryByTestId('login-screen')).toBeNull();
    expect(screen.getByText('Inicio')).toBeTruthy();
    expect(screen.getByText('Nueva Venta')).toBeTruthy();
    expect(screen.getByText('Gastos')).toBeTruthy();
    expect(screen.getByText('Sincronización')).toBeTruthy();
  });

  it('Inicio still renders HomeScreen content, now nested inside HomeStack (PR5)', async () => {
    mockedUseAuth.mockReturnValue({ ...baseAuthValue, status: 'authenticated', username: 'chofer1' });

    await render(<RootNavigator />);

    // bottom-tabs eagerly mounts only the initially-focused tab (Inicio),
    // which is now a 2-screen native-stack instead of a bare HomeScreen —
    // this proves the "Home" route inside HomeStack actually renders.
    expect(screen.getByTestId('home-screen')).toBeTruthy();
  });

  it('exposes exactly 4 tabs, each with an icon and a visible text label, and no drawer/hamburger element', async () => {
    mockedUseAuth.mockReturnValue({ ...baseAuthValue, status: 'authenticated', username: 'chofer1' });

    await render(<RootNavigator />);

    // bottom-tabs renders each tabBarIcon twice (a focused/unfocused color
    // cross-fade pair) — assert on the set of DISTINCT tab testIDs, not the
    // raw element count, to prove exactly 4 tabs exist (no 5th tab).
    const tabIcons = screen.getAllByTestId(/^tab-icon-/);
    const distinctTabIds = new Set(tabIcons.map((node) => node.props.testID));
    expect(distinctTabIds).toEqual(
      new Set(['tab-icon-inicio', 'tab-icon-nueva-venta', 'tab-icon-gastos', 'tab-icon-sincronizacion']),
    );

    expect(screen.getAllByTestId('tab-icon-inicio').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('tab-icon-nueva-venta').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('tab-icon-gastos').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('tab-icon-sincronizacion').length).toBeGreaterThan(0);

    expect(screen.queryByTestId(/drawer|hamburger/i)).toBeNull();
    expect(screen.queryByLabelText(/menu/i)).toBeNull();
  });
});
