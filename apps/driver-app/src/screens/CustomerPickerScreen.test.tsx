jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../context/AuthContext', () => {
  const actual = jest.requireActual('../context/AuthContext');
  return {
    ...actual,
    useAuth: jest.fn(),
  };
});

jest.mock('../services/location', () => ({
  captureDeviceLocation: jest.fn(),
}));

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
import { StyleSheet } from 'react-native';
import type { CustomerRecord } from '@distribuidor/shared';
import { CustomerPickerScreen } from './CustomerPickerScreen';
import { ApiError } from '../services/apiClient';
import { useAuth } from '../context/AuthContext';
import { captureDeviceLocation } from '../services/location';
import { MIN_TOUCH_TARGET } from '../theme/spacing';

const mockedUseAuth = useAuth as jest.Mock;
const mockedCaptureDeviceLocation = captureDeviceLocation as jest.Mock;
let mockedApiGet: jest.Mock;
let mockedApiPost: jest.Mock;

const customers: CustomerRecord[] = [
  {
    id: 'customer-1',
    name: 'Kiosco Sur',
    customerType: 'comercio',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'customer-2',
    name: 'Almacen Norte',
    customerType: 'final',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

// Three known distances from origin -34.60,-58.38 (Design decision #10/#11):
// far (~10km), near (~0.5km), mid (~2km) -- deliberately not pre-sorted, so
// a passing test proves sortByProximity actually reordered them.
const locatedCustomers: CustomerRecord[] = [
  {
    id: 'far-1',
    name: 'Deposito Lejano',
    customerType: 'distribuidor',
    latitude: -34.69,
    longitude: -58.38,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'near-1',
    name: 'Kiosco Cercano',
    customerType: 'comercio',
    latitude: -34.6042,
    longitude: -58.382,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'mid-1',
    name: 'Almacen Medio',
    customerType: 'final',
    latitude: -34.618,
    longitude: -58.38,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'unlocated-1',
    name: 'Sin Coordenadas',
    customerType: 'final',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const readerLocation = { latitude: -34.6037, longitude: -58.3816 };

beforeEach(() => {
  mockedNavigate.mockClear();
  mockedApiGet = jest.fn().mockResolvedValue(customers);
  mockedApiPost = jest.fn();
  mockedCaptureDeviceLocation.mockReset();
  mockedCaptureDeviceLocation.mockResolvedValue(null);
  mockedUseAuth.mockReturnValue({
    status: 'authenticated' as const,
    token: 'tok',
    username: 'chofer1',
    loading: false,
    api: { get: mockedApiGet, post: mockedApiPost },
    login: jest.fn(),
    logout: jest.fn(),
    requireAuthToken: jest.fn(() => 'tok'),
  });
});

describe('CustomerPickerScreen/lista', () => {
  it('fetches and renders the customer list from GET /customers', async () => {
    await render(<CustomerPickerScreen />);

    await waitFor(() => expect(mockedApiGet).toHaveBeenCalledWith('/customers'));
    expect(screen.getByText('Kiosco Sur')).toBeTruthy();
    expect(screen.getByText('Almacen Norte')).toBeTruthy();
  });
});

describe('CustomerPickerScreen/busqueda', () => {
  it('filters the list by name substring, case-insensitive', async () => {
    await render(<CustomerPickerScreen />);
    await waitFor(() => expect(screen.getByText('Kiosco Sur')).toBeTruthy());

    await fireEvent.changeText(screen.getByTestId('customer-picker-search'), 'kiosco');

    await waitFor(() => expect(screen.queryByText('Almacen Norte')).toBeNull());
    expect(screen.getByText('Kiosco Sur')).toBeTruthy();
  });
});

describe('CustomerPickerScreen/seleccion', () => {
  it('navigates back to Sale with pickedCustomer when a customer is tapped', async () => {
    await render(<CustomerPickerScreen />);
    await waitFor(() => expect(screen.getByText('Kiosco Sur')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('customer-picker-item-customer-1'));

    expect(mockedNavigate).toHaveBeenCalledWith('Sale', {
      pickedCustomer: { id: 'customer-1', name: 'Kiosco Sur', customerType: 'comercio' },
    });
  });
});

describe('CustomerPickerScreen/accesibilidad', () => {
  it('enforces a minimum touch target height on each customer row', async () => {
    await render(<CustomerPickerScreen />);
    await waitFor(() => expect(screen.getByText('Kiosco Sur')).toBeTruthy());

    const row = screen.getByTestId('customer-picker-item-customer-1');
    const flatStyle = StyleSheet.flatten(row.props.style);
    expect(flatStyle.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });

  it('shows a loading indicator while the customer list fetch is in flight', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    mockedApiGet.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    await render(<CustomerPickerScreen />);

    const loadingRow = screen.getByTestId('customer-picker-loading');
    const hasActivityIndicator = loadingRow.children.some(
      (child) => typeof child !== 'string' && child.type === 'ActivityIndicator',
    );
    expect(hasActivityIndicator).toBe(true);

    resolveFetch(customers);
    await waitFor(() => expect(screen.queryByTestId('customer-picker-loading')).toBeNull());
  });
});

// Phase 6 PR3 (docs/plans/customer-picker-proximity.md, design decisions
// #10/#11): a fresh, independent captureDeviceLocation() read on mount,
// then sortByProximity (packages/shared) reorders the fetched list --
// nearest-first, unlocated items appended unchanged, never filtered out.
describe('CustomerPickerScreen/cercania', () => {
  it('sorts the rendered list by ascending distance when the GPS read succeeds, marking the nearest as cerca tuyo', async () => {
    mockedApiGet.mockResolvedValue(locatedCustomers);
    mockedCaptureDeviceLocation.mockResolvedValue(readerLocation);

    await render(<CustomerPickerScreen />);

    await waitFor(() => expect(mockedCaptureDeviceLocation).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Kiosco Cercano')).toBeTruthy());

    const list = screen.getByTestId('customer-picker-list');
    const names = list.props.data.map((c: CustomerRecord) => c.name);
    expect(names).toEqual([
      'Kiosco Cercano',
      'Almacen Medio',
      'Deposito Lejano',
      'Sin Coordenadas',
    ]);

    expect(screen.getByTestId('customer-picker-near-badge-near-1')).toBeTruthy();
    expect(screen.queryByTestId('customer-picker-near-badge-unlocated-1')).toBeNull();
  });

  it('keeps the plain fetched-order list, still searchable, when the GPS read fails/denies/times out', async () => {
    mockedApiGet.mockResolvedValue(customers);
    mockedCaptureDeviceLocation.mockResolvedValue(null);

    await render(<CustomerPickerScreen />);

    await waitFor(() => expect(mockedCaptureDeviceLocation).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Kiosco Sur')).toBeTruthy());

    const list = screen.getByTestId('customer-picker-list');
    const names = list.props.data.map((c: CustomerRecord) => c.name);
    expect(names).toEqual(['Kiosco Sur', 'Almacen Norte']);

    await fireEvent.changeText(screen.getByTestId('customer-picker-search'), 'almacen');
    await waitFor(() => expect(screen.queryByText('Kiosco Sur')).toBeNull());
    expect(screen.getByText('Almacen Norte')).toBeTruthy();
  });
});

// Phase 6 PR3, design decisions #12/#13: quick creation is online-only,
// requires only name + customerType, coordinates attached best-effort from
// the same picker-open GPS read used for proximity sort above.
describe('CustomerPickerScreen/alta rapida', () => {
  it('includes latitude/longitude in the POST payload when a GPS reading is available', async () => {
    mockedCaptureDeviceLocation.mockResolvedValue(readerLocation);
    mockedApiPost.mockResolvedValue({
      id: 'new-customer-1',
      name: 'Almacen Norte 2',
      customerType: 'final',
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await render(<CustomerPickerScreen />);
    await waitFor(() => expect(mockedCaptureDeviceLocation).toHaveBeenCalledTimes(1));

    // El alta rapida arranca cerrada: la accion normal es elegir de la
    // lista, no crear un cliente.
    await fireEvent.press(screen.getByTestId('customer-picker-quick-create-open'));
    await fireEvent.changeText(
      screen.getByTestId('customer-picker-quick-create-name'),
      'Almacen Norte 2',
    );
    await fireEvent.press(screen.getByTestId('customer-picker-quick-create-submit'));

    await waitFor(() =>
      expect(mockedApiPost).toHaveBeenCalledWith('/customers', {
        name: 'Almacen Norte 2',
        customerType: 'final',
        latitude: readerLocation.latitude,
        longitude: readerLocation.longitude,
      }),
    );
    expect(mockedNavigate).toHaveBeenCalledWith('Sale', {
      pickedCustomer: { id: 'new-customer-1', name: 'Almacen Norte 2', customerType: 'final' },
    });
  });

  it('omits latitude/longitude from the POST payload when no GPS reading is available', async () => {
    mockedCaptureDeviceLocation.mockResolvedValue(null);
    mockedApiPost.mockResolvedValue({
      id: 'new-customer-2',
      name: 'Sin Ubicacion',
      customerType: 'comercio',
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await render(<CustomerPickerScreen />);
    await waitFor(() => expect(mockedCaptureDeviceLocation).toHaveBeenCalledTimes(1));

    // El alta rapida arranca cerrada: la accion normal es elegir de la
    // lista, no crear un cliente.
    await fireEvent.press(screen.getByTestId('customer-picker-quick-create-open'));
    await fireEvent.changeText(
      screen.getByTestId('customer-picker-quick-create-name'),
      'Sin Ubicacion',
    );
    await fireEvent.press(screen.getByTestId('customer-picker-quick-create-type-comercio'));
    await fireEvent.press(screen.getByTestId('customer-picker-quick-create-submit'));

    await waitFor(() =>
      expect(mockedApiPost).toHaveBeenCalledWith('/customers', {
        name: 'Sin Ubicacion',
        customerType: 'comercio',
      }),
    );
    expect(mockedApiPost.mock.calls[0][1]).not.toHaveProperty('latitude');
    expect(mockedApiPost.mock.calls[0][1]).not.toHaveProperty('longitude');
  });

  it('shows an error banner and does not navigate away when the POST fails (incl. offline)', async () => {
    mockedCaptureDeviceLocation.mockResolvedValue(null);
    mockedApiPost.mockRejectedValue(new Error('Network request failed'));

    await render(<CustomerPickerScreen />);
    await waitFor(() => expect(mockedCaptureDeviceLocation).toHaveBeenCalledTimes(1));

    // El alta rapida arranca cerrada: la accion normal es elegir de la
    // lista, no crear un cliente.
    await fireEvent.press(screen.getByTestId('customer-picker-quick-create-open'));
    await fireEvent.changeText(
      screen.getByTestId('customer-picker-quick-create-name'),
      'Cliente Fallido',
    );
    await fireEvent.press(screen.getByTestId('customer-picker-quick-create-submit'));

    await waitFor(() => expect(mockedApiPost).toHaveBeenCalledTimes(1));
    expect(
      screen.getByText('No se pudo crear el cliente. Revisa la conexion e intenta de nuevo.'),
    ).toBeTruthy();
    expect(mockedNavigate).not.toHaveBeenCalled();
  });
});

describe('CustomerPickerScreen — address', () => {
  it('shows the street address on the row when the customer has one', async () => {
    mockedCaptureDeviceLocation.mockResolvedValue(null);
    mockedApiGet.mockResolvedValue([
      { ...customers[0], address: 'Av. Mitre 1234' },
      customers[1],
    ]);

    await render(<CustomerPickerScreen />);

    await waitFor(() => expect(screen.getByText('Av. Mitre 1234')).toBeTruthy());
  });

  it('renders a customer with no address exactly as before', async () => {
    mockedCaptureDeviceLocation.mockResolvedValue(null);
    mockedApiGet.mockResolvedValue(customers);

    await render(<CustomerPickerScreen />);

    await waitFor(() => expect(screen.getByText('Kiosco Sur')).toBeTruthy());
    expect(screen.queryByTestId('customer-picker-address-customer-1')).toBeNull();
  });
});

describe('CustomerPickerScreen — duplicate on quick create', () => {
  const conflictingCustomer = {
    id: 'existing-9',
    name: 'Don Jose',
    customerType: 'final' as const,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const rejectWithConflict = () =>
    mockedApiPost.mockRejectedValueOnce(
      new ApiError(409, 'A customer with this name already exists in this zone', {
        message: 'A customer with this name already exists in this zone',
        customer: conflictingCustomer,
      }),
    );

  const typeNameAndSubmit = async () => {
    // El alta rapida arranca cerrada: la accion normal es elegir de la
    // lista, no crear un cliente.
    await fireEvent.press(screen.getByTestId('customer-picker-quick-create-open'));
    await fireEvent.changeText(
      screen.getByTestId('customer-picker-quick-create-name'),
      'Don Jose',
    );
    await fireEvent.press(screen.getByTestId('customer-picker-quick-create-submit'));
  };

  beforeEach(() => {
    mockedCaptureDeviceLocation.mockResolvedValue(null);
    mockedApiGet.mockResolvedValue(customers);
  });

  it('offers the existing customer instead of showing a raw error', async () => {
    rejectWithConflict();

    await render(<CustomerPickerScreen />);
    await waitFor(() => expect(mockedCaptureDeviceLocation).toHaveBeenCalledTimes(1));
    await typeNameAndSubmit();

    await waitFor(() =>
      expect(screen.getByTestId('customer-picker-duplicate')).toBeTruthy(),
    );
    expect(mockedNavigate).not.toHaveBeenCalled();
  });

  // The driver is standing in front of the customer; picking the existing one
  // must be a single tap, not a retype.
  it('picks the existing customer and continues the sale', async () => {
    rejectWithConflict();

    await render(<CustomerPickerScreen />);
    await waitFor(() => expect(mockedCaptureDeviceLocation).toHaveBeenCalledTimes(1));
    await typeNameAndSubmit();
    await waitFor(() =>
      expect(screen.getByTestId('customer-picker-duplicate-use')).toBeTruthy(),
    );
    await fireEvent.press(screen.getByTestId('customer-picker-duplicate-use'));

    expect(mockedNavigate).toHaveBeenCalledWith('Sale', {
      pickedCustomer: {
        id: 'existing-9',
        name: 'Don Jose',
        customerType: 'final',
      },
    });
  });

  it('retries allowing the duplicate when the driver says it is another customer', async () => {
    rejectWithConflict();
    mockedApiPost.mockResolvedValueOnce({
      id: 'new-customer-9',
      name: 'Don Jose',
      customerType: 'final',
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await render(<CustomerPickerScreen />);
    await waitFor(() => expect(mockedCaptureDeviceLocation).toHaveBeenCalledTimes(1));
    await typeNameAndSubmit();
    await waitFor(() =>
      expect(screen.getByTestId('customer-picker-duplicate-force')).toBeTruthy(),
    );
    await fireEvent.press(screen.getByTestId('customer-picker-duplicate-force'));

    await waitFor(() => expect(mockedApiPost).toHaveBeenCalledTimes(2));
    expect(mockedApiPost.mock.calls[1][0]).toBe('/customers?allowDuplicate=true');
    expect(mockedNavigate).toHaveBeenCalledWith('Sale', {
      pickedCustomer: { id: 'new-customer-9', name: 'Don Jose', customerType: 'final' },
    });
  });

  it('keeps showing a plain error banner for any non-409 failure', async () => {
    mockedApiPost.mockRejectedValueOnce(new Error('Network request failed'));

    await render(<CustomerPickerScreen />);
    await waitFor(() => expect(mockedCaptureDeviceLocation).toHaveBeenCalledTimes(1));
    await typeNameAndSubmit();

    await waitFor(() =>
      expect(
        screen.getByText('No se pudo crear el cliente. Revisa la conexion e intenta de nuevo.'),
      ).toBeTruthy(),
    );
    expect(screen.queryByTestId('customer-picker-duplicate')).toBeNull();
  });
});

describe('CustomerPickerScreen/subtitulo de la fila', () => {
  it('reads the customer type alongside how far away it is', async () => {
    mockedApiGet.mockResolvedValue(locatedCustomers);
    mockedCaptureDeviceLocation.mockResolvedValue(readerLocation);

    await render(<CustomerPickerScreen />);

    await waitFor(() => expect(screen.getByText('Kiosco Cercano')).toBeTruthy());
    // La distancia se muestra aca, donde sirve para elegir — no en la pantalla
    // de carga, donde el cliente ya esta elegido.
    expect(screen.getByTestId('customer-picker-subtitle-near-1')).toHaveTextContent(/^\w+ · a /);
  });

  it('falls back to the type alone when there is no GPS reading to measure from', async () => {
    mockedApiGet.mockResolvedValue(locatedCustomers);
    mockedCaptureDeviceLocation.mockResolvedValue(null);

    await render(<CustomerPickerScreen />);

    await waitFor(() => expect(screen.getByText('Kiosco Cercano')).toBeTruthy());
    expect(screen.getByTestId('customer-picker-subtitle-near-1')).not.toHaveTextContent(/ · a /);
  });

  it('falls back to the type alone for a customer with no coordinates on file', async () => {
    mockedApiGet.mockResolvedValue(locatedCustomers);
    mockedCaptureDeviceLocation.mockResolvedValue(readerLocation);

    await render(<CustomerPickerScreen />);

    await waitFor(() => expect(screen.getByText('Sin Coordenadas')).toBeTruthy());
    expect(screen.getByTestId('customer-picker-subtitle-unlocated-1')).not.toHaveTextContent(
      / · a /,
    );
  });
});

describe('CustomerPickerScreen/alta rapida colapsada', () => {
  it('keeps the create form out of the way until it is asked for', async () => {
    mockedApiGet.mockResolvedValue(customers);

    await render(<CustomerPickerScreen />);

    expect(screen.queryByTestId('customer-picker-quick-create-name')).toBeNull();
    expect(screen.getByTestId('customer-picker-quick-create-open')).toBeTruthy();
  });

  it('reveals the form when the driver asks for a new customer', async () => {
    mockedApiGet.mockResolvedValue(customers);

    await render(<CustomerPickerScreen />);
    await fireEvent.press(screen.getByTestId('customer-picker-quick-create-open'));

    expect(screen.getByTestId('customer-picker-quick-create-name')).toBeTruthy();
    expect(screen.queryByTestId('customer-picker-quick-create-open')).toBeNull();
  });
});
