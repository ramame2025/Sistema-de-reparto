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

jest.mock('../context/CatalogContext', () => {
  const actual = jest.requireActual('../context/CatalogContext');
  return {
    ...actual,
    useCatalog: jest.fn(),
  };
});

jest.mock('../context/TruckContext', () => {
  const actual = jest.requireActual('../context/TruckContext');
  return {
    ...actual,
    useTruck: jest.fn(),
  };
});

jest.mock('../context/AuthContext', () => {
  const actual = jest.requireActual('../context/AuthContext');
  return {
    ...actual,
    useAuth: jest.fn(),
  };
});

// Phase 6 PR2 (docs/plans/customer-picker-proximity.md): NewSaleScreen now
// reads the picked-customer param via useRoute() and navigates to the
// picker via useNavigation() -- same hook-based pattern HomeScreen.test.tsx
// already established, not screen props, since NewSaleScreen is rendered
// standalone (no NavigationContainer) by every test in this file.
// mockedRouteParams is reset in beforeEach and overridden per-test.
let mockedRouteParams: { pickedCustomer?: { id: string; name: string; customerType: string } } | undefined;
const mockedNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockedNavigate }),
    useRoute: () => ({ params: mockedRouteParams }),
  };
});

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import * as ExpoFileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { NewSaleScreen } from './NewSaleScreen';
import { useSync } from '../context/SyncContext';
import { useAuth } from '../context/AuthContext';
import { useTruck } from '../context/TruckContext';
import { useCatalog } from '../context/CatalogContext';
import { colors } from '../theme/colors';

const mockedUseSync = useSync as jest.Mock;
const mockedUseAuth = useAuth as jest.Mock;
const mockedUseTruck = useTruck as jest.Mock;
const mockedUseCatalog = useCatalog as jest.Mock;
const mockedLaunchImageLibraryAsync = ImagePicker.launchImageLibraryAsync as jest.Mock;
const mockedFile = ExpoFileSystem.File as unknown as jest.Mock;
// mockUpload is a manual-mock-only export not present in the real module's
// types; see __mocks__/expo-file-system.ts.
const mockUpload = (ExpoFileSystem as unknown as { mockUpload: jest.Mock }).mockUpload;
const mockedRequestForegroundPermissionsAsync =
  Location.requestForegroundPermissionsAsync as jest.Mock;
const mockedGetCurrentPositionAsync = Location.getCurrentPositionAsync as jest.Mock;

const assignedTruck = {
  assignmentId: 'a-1',
  kind: 'titular' as const,
  truckId: 'truck-1',
  code: 'CAMION-07',
  plate: 'AB123CD',
  capacity: 40,
  startDate: '2026-02-01T00:00:00.000Z',
  endDate: null,
};

const catalogProduct = (code: string, sortOrder: number) => ({
  id: `p-${code}`,
  code,
  name: `Producto ${code}`,
  isActive: true,
  sortOrder,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const baseCatalogValue = {
  products: [
    catalogProduct('G10', 0),
    catalogProduct('G15', 1),
    catalogProduct('G45', 2),
    catalogProduct('G15_AUTO', 3),
  ],
  prices: {
    final: { G10: 8500, G15: 13000, G45: 39000, G15_AUTO: 14500 },
    comercio: { G10: 8200, G15: 12600, G45: 38000, G15_AUTO: 14000 },
    distribuidor: { G10: 7900, G15: 12100, G45: 36500, G15_AUTO: 13600 },
  },
  status: 'ready' as const,
  stale: false,
  fetchedAt: '2026-08-27T10:00:00.000Z',
  canSell: true,
  error: null,
  reload: jest.fn(),
};

const baseTruckValue = {
  truck: assignedTruck,
  date: '2026-02-11',
  status: 'ready' as const,
  error: null,
  reload: jest.fn(),
};

const baseSyncValue = {
  pendingSales: [],
  syncing: false,
  daySummary: { activeCount: 0, canceledCount: 0, activeTotal: 0 },
  summaryLoading: false,
  summaryError: null,
  assignedTruckCode: 'CAMION-07',
  trySendSale: jest.fn(),
  enqueueSale: jest.fn(),
  trySendEmptyVisit: jest.fn(),
  enqueueEmptyVisit: jest.fn(),
  syncPendingSales: jest.fn(),
  refreshDaySummary: jest.fn().mockResolvedValue(undefined),
};

const baseAuthValue = {
  status: 'authenticated' as const,
  token: 'tok',
  username: 'chofer1',
  loading: false,
  api: { patch: jest.fn() },
  login: jest.fn(),
  logout: jest.fn(),
  requireAuthToken: jest.fn(() => 'tok'),
};

const successUpload = (url: string) => ({
  body: JSON.stringify({ url }),
  status: 200,
  headers: {},
});

let mockedTrySendSale: jest.Mock;
let mockedEnqueueSale: jest.Mock;
let mockedTrySendEmptyVisit: jest.Mock;
let mockedEnqueueEmptyVisit: jest.Mock;
let mockedRefreshDaySummary: jest.Mock;
let mockedApiPatch: jest.Mock;

beforeEach(() => {
  mockedRouteParams = undefined;
  mockedNavigate.mockClear();
  mockedTrySendSale = jest.fn();
  mockedEnqueueSale = jest.fn().mockResolvedValue(1);
  mockedTrySendEmptyVisit = jest.fn();
  mockedEnqueueEmptyVisit = jest.fn().mockResolvedValue(1);
  mockedRefreshDaySummary = jest.fn().mockResolvedValue(undefined);
  mockedApiPatch = jest.fn();
  mockedFile.mockClear();
  mockUpload.mockClear();
  mockUpload.mockResolvedValue(successUpload('https://cdn.test/mock-upload.jpg'));

  mockedUseSync.mockReturnValue({
    ...baseSyncValue,
    trySendSale: mockedTrySendSale,
    enqueueSale: mockedEnqueueSale,
    trySendEmptyVisit: mockedTrySendEmptyVisit,
    enqueueEmptyVisit: mockedEnqueueEmptyVisit,
    refreshDaySummary: mockedRefreshDaySummary,
  });
  mockedUseTruck.mockReturnValue(baseTruckValue);
  mockedUseCatalog.mockReturnValue(baseCatalogValue);
  mockedUseAuth.mockReturnValue({
    ...baseAuthValue,
    api: { patch: mockedApiPatch },
  });

  mockedLaunchImageLibraryAsync.mockClear();
  mockedLaunchImageLibraryAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://fake.jpg' }],
  });

  mockedRequestForegroundPermissionsAsync.mockClear();
  mockedRequestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
  mockedGetCurrentPositionAsync.mockClear();
  mockedGetCurrentPositionAsync.mockResolvedValue({
    coords: { latitude: -34.6037, longitude: -58.3816 },
  });
});

// Every test needs a picked customer to get past the footer guard: the name
// and the type are directory data now, so there is no text field to type them
// into. Tests that exercise the no-customer path render the screen directly.
const renderSaleScreen = async (
  customerName = 'Cliente de prueba',
  customerType: 'final' | 'comercio' | 'distribuidor' = 'final',
) => {
  mockedRouteParams = { pickedCustomer: { id: 'cus-1', name: customerName, customerType } };
  return render(<NewSaleScreen />);
};

const saveOneSale = async (saleId: string) => {
  mockedTrySendSale.mockResolvedValueOnce(saleId);
  await fireEvent.press(screen.getByTestId('product-row-G10-increment'));
  await fireEvent.press(screen.getByTestId('sale-footer-action'));
  await waitFor(() =>
    expect(mockedNavigate).toHaveBeenCalledWith('SaleResult', expect.anything()),
  );
};

describe('NewSaleScreen/online success', () => {
  it('submits, resets the form, refreshes the summary, and hands off to the result screen', async () => {
    mockedTrySendSale.mockResolvedValue('sale-123');

    await renderSaleScreen('Kiosco La Esquina');
    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));
    await fireEvent.press(screen.getByTestId('sale-footer-action'));

    await waitFor(() => expect(mockedTrySendSale).toHaveBeenCalledTimes(1));
    expect(mockedNavigate).toHaveBeenCalledWith('SaleResult', {
      outcome: 'sent',
      customerName: 'Kiosco La Esquina',
      total: 8500,
      paymentMethod: 'efectivo',
    });
    expect(screen.getByTestId('sale-footer-total')).toHaveTextContent('$0');
    expect(mockedRefreshDaySummary).toHaveBeenCalledTimes(1);
  });
});

describe('NewSaleScreen/offline fallback', () => {
  it('falls back to enqueueSale with a cause when trySendSale fails, showing distinct feedback', async () => {
    mockedTrySendSale.mockRejectedValue(new Error('Network request failed'));

    await renderSaleScreen();
    await fireEvent.press(screen.getByTestId('product-row-G15-increment'));
    await fireEvent.press(screen.getByTestId('sale-footer-action'));

    await waitFor(() => expect(mockedEnqueueSale).toHaveBeenCalledTimes(1));
    expect(mockedEnqueueSale).toHaveBeenCalledWith(
      expect.objectContaining({ items: [{ productCode: 'G15', quantity: 1 }] }),
      'Network request failed',
    );
    // Desenlace distinto, pantalla distinta: la venta sigue en el telefono.
    expect(mockedNavigate).toHaveBeenCalledWith(
      'SaleResult',
      expect.objectContaining({ outcome: 'queued' }),
    );
    expect(screen.getByTestId('sale-footer-total')).toHaveTextContent('$0');
  });
});

describe('NewSaleScreen/product quantities', () => {
  it('updates the derived total via calculateSaleTotal as steppers change', async () => {
    await renderSaleScreen();

    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));
    expect(screen.getByTestId('sale-footer-total')).toHaveTextContent('$8.500');

    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));
    expect(screen.getByTestId('sale-footer-total')).toHaveTextContent('$17.000');

    await fireEvent.press(screen.getByTestId('product-row-G10-decrement'));
    expect(screen.getByTestId('sale-footer-total')).toHaveTextContent('$8.500');
  });
});

describe('NewSaleScreen/camion asignado', () => {
  it('shows the assigned truck in the header, with no free-text input to type it', async () => {
    await renderSaleScreen();

    expect(screen.getByTestId('new-sale-header')).toBeTruthy();
    expect(screen.getByText(/CAMION-07/)).toBeTruthy();
    // El camion ya no se escribe: sale de la asignacion.
    expect(screen.queryByTestId('new-sale-truck-code')).toBeNull();
  });

  it('sends truckId and truckCode from the assignment, not from anything the driver typed', async () => {
    await renderSaleScreen();

    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));
    await fireEvent.press(screen.getByTestId('sale-footer-action'));

    await waitFor(() => expect(mockedTrySendSale).toHaveBeenCalled());
    expect(mockedTrySendSale.mock.calls[0][0]).toMatchObject({
      truckId: 'truck-1',
      truckCode: 'CAMION-07',
    });
  });

  it('blocks the sale and explains why when the driver has no truck today', async () => {
    // Sin camion no se puede cargar una venta: quedaria sin unidad asignada.
    mockedUseTruck.mockReturnValue({ ...baseTruckValue, truck: null });

    await renderSaleScreen();

    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));
    await fireEvent.press(screen.getByTestId('sale-footer-action'));

    expect(mockedTrySendSale).not.toHaveBeenCalled();
    expect(mockedEnqueueSale).not.toHaveBeenCalled();
    expect(screen.getByTestId('new-sale-no-truck')).toBeTruthy();
  });

  it('distinguishes a connection failure from having no truck assigned', async () => {
    // Son dos mensajes opuestos: uno se resuelve reintentando, el otro
    // hablando con el admin.
    mockedUseTruck.mockReturnValue({
      ...baseTruckValue,
      truck: null,
      status: 'error',
      error: 'No se pudo consultar tu camion asignado.',
    });

    await renderSaleScreen();

    expect(screen.getByTestId('new-sale-truck-error')).toBeTruthy();
    expect(screen.queryByTestId('new-sale-no-truck')).toBeNull();
  });
});

describe('NewSaleScreen/envase devuelto toggle (visit-container-model Unit 4)', () => {
  it('starts unmarked and reads its state back in words as it is flipped', async () => {
    await renderSaleScreen();

    // "Sin marcar" is the third state the boolean cannot carry: it is what
    // keeps `containerReturned` out of the payload entirely.
    expect(screen.getByText('Sin marcar')).toBeTruthy();

    await fireEvent(
      screen.getByTestId('new-sale-container-returned-switch'),
      'valueChange',
      true,
    );
    expect(screen.getByText('Devuelto')).toBeTruthy();

    await fireEvent(
      screen.getByTestId('new-sale-container-returned-switch'),
      'valueChange',
      false,
    );
    expect(screen.getByText('No devolvió')).toBeTruthy();
  });

  it('omits containerReturned from the Guardar venta payload when never touched', async () => {
    mockedTrySendSale.mockResolvedValue('sale-123');

    await renderSaleScreen();
    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));
    await fireEvent.press(screen.getByTestId('sale-footer-action'));

    await waitFor(() => expect(mockedTrySendSale).toHaveBeenCalledTimes(1));
    const payload = mockedTrySendSale.mock.calls[0][0];
    expect(Object.prototype.hasOwnProperty.call(payload, 'containerReturned')).toBe(false);
  });

  it('includes containerReturned:true in the Guardar venta payload once toggled on', async () => {
    mockedTrySendSale.mockResolvedValue('sale-123');

    await renderSaleScreen();
    await fireEvent(
      screen.getByTestId('new-sale-container-returned-switch'),
      'valueChange',
      true,
    );
    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));
    await fireEvent.press(screen.getByTestId('sale-footer-action'));

    await waitFor(() => expect(mockedTrySendSale).toHaveBeenCalledTimes(1));
    expect(mockedTrySendSale.mock.calls[0][0]).toMatchObject({ containerReturned: true });
  });
});

describe('NewSaleScreen/registrar visita sin venta (churn, visit-container-model Unit 4)', () => {
  // La visita sin venta dejo de ser una tarjeta aparte: es el estado del boton
  // del pie cuando no hay productos y el envase quedo marcado. Sigue siendo el
  // endpoint distinto de siempre, con su payload sin items ni forma de pago.
  const markContainerReturned = async () =>
    fireEvent(screen.getByTestId('new-sale-container-returned-switch'), 'valueChange', true);

  it('takes over the footer action when the container is returned and nothing was sold', async () => {
    await renderSaleScreen();

    expect(screen.getByTestId('sale-footer-action')).toHaveTextContent('Agregá productos');

    await markContainerReturned();

    expect(screen.getByTestId('sale-footer-action')).toHaveTextContent('Registrar devolución');
  });

  it('goes back to being a normal sale as soon as a product is added', async () => {
    await renderSaleScreen();
    await markContainerReturned();
    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));

    expect(screen.getByTestId('sale-footer-action')).toHaveTextContent('Guardar venta');
  });

  it('does not require any items loaded, unlike Guardar venta', async () => {
    mockedTrySendEmptyVisit.mockResolvedValue('visit-1');

    await renderSaleScreen();
    await markContainerReturned();
    await fireEvent.press(screen.getByTestId('sale-footer-action'));

    await waitFor(() => expect(mockedTrySendEmptyVisit).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Agrega al menos un producto antes de guardar.')).toBeNull();
  });

  it('calls trySendEmptyVisit with an items/paymentMethod-free payload and shows a distinct confirmation', async () => {
    mockedTrySendEmptyVisit.mockResolvedValue('visit-1');

    await renderSaleScreen();
    await markContainerReturned();
    await fireEvent.press(screen.getByTestId('sale-footer-action'));

    await waitFor(() => expect(mockedTrySendEmptyVisit).toHaveBeenCalledTimes(1));
    const payload = mockedTrySendEmptyVisit.mock.calls[0][0];
    expect(payload).not.toHaveProperty('items');
    expect(payload).not.toHaveProperty('paymentMethod');
    expect(payload).toMatchObject({ driverName: 'chofer1', truckId: 'truck-1', truckCode: 'CAMION-07' });

    // Distinct copy so a chofer never mistakes this for a normal sale confirmation.
    expect(screen.getByText('Visita sin venta registrada. ID: visit-1')).toBeTruthy();
    expect(mockedTrySendSale).not.toHaveBeenCalled();
  });

  it('falls back to enqueueEmptyVisit on failure, same offline-queue pattern saveSale uses', async () => {
    mockedTrySendEmptyVisit.mockRejectedValue(new Error('Network request failed'));
    mockedEnqueueEmptyVisit.mockResolvedValue(1);

    await renderSaleScreen();
    await markContainerReturned();
    await fireEvent.press(screen.getByTestId('sale-footer-action'));

    await waitFor(() => expect(mockedEnqueueEmptyVisit).toHaveBeenCalledTimes(1));
    expect(mockedEnqueueEmptyVisit).toHaveBeenCalledWith(
      expect.objectContaining({ driverName: 'chofer1' }),
      'Network request failed',
    );
    expect(
      screen.getByText('Sin conexion. Visita sin venta en cola offline (1 pendientes).'),
    ).toBeTruthy();
  });

  it('offers no action at all when the driver has no truck today, same guard as saveSale', async () => {
    mockedUseTruck.mockReturnValue({ ...baseTruckValue, truck: null });

    await renderSaleScreen();
    await markContainerReturned();
    await fireEvent.press(screen.getByTestId('sale-footer-action'));

    expect(mockedTrySendEmptyVisit).not.toHaveBeenCalled();
    expect(mockedEnqueueEmptyVisit).not.toHaveBeenCalled();
    expect(screen.getByTestId('sale-footer-action')).toHaveTextContent('Sin camión asignado');
    expect(screen.getByTestId('new-sale-no-truck')).toBeTruthy();
  });
});

describe('NewSaleScreen/comprobante de pago (payment-proof-photo)', () => {
  it('does not render the payment proof control when paymentMethod is efectivo (default)', async () => {
    await renderSaleScreen();

    expect(screen.queryByTestId('new-sale-payment-proof-pick-gallery')).toBeNull();
    expect(screen.queryByTestId('new-sale-payment-proof-capture-camera')).toBeNull();
  });

  it.each(['transferencia', 'qr', 'tarjeta'])(
    'renders the payment proof control when paymentMethod is %s',
    async (method) => {
      await renderSaleScreen();

      await fireEvent.press(screen.getByTestId(`new-sale-payment-${method}`));

      expect(screen.getByTestId('new-sale-payment-proof-pick-gallery')).toBeTruthy();
      expect(screen.getByTestId('new-sale-payment-proof-capture-camera')).toBeTruthy();
    },
  );

  it('hides the payment proof control again when switching back to efectivo', async () => {
    await renderSaleScreen();

    await fireEvent.press(screen.getByTestId('new-sale-payment-transferencia'));
    expect(screen.getByTestId('new-sale-payment-proof-pick-gallery')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('new-sale-payment-efectivo'));
    expect(screen.queryByTestId('new-sale-payment-proof-pick-gallery')).toBeNull();
  });

  it('uploads a picked photo and includes paymentProofRef in the Guardar venta payload', async () => {
    mockUpload.mockResolvedValue(successUpload('https://cdn.test/proof-1.jpg'));
    mockedTrySendSale.mockResolvedValue('sale-123');

    await renderSaleScreen();
    await fireEvent.press(screen.getByTestId('new-sale-payment-transferencia'));
    await fireEvent.press(screen.getByTestId('new-sale-payment-proof-pick-gallery'));

    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1));
    // Uses expo-file-system's File.upload() (native multipart task) -- the RN
    // {uri,name,type} FormData shorthand throws "Unsupported FormDataPart
    // implementation", and rebuilding a Blob from the file's bytes throws
    // "Creating blobs from 'ArrayBuffer' ... are not supported" on this
    // RN/Expo version. File.upload() bypasses both.
    expect(mockedFile).toHaveBeenCalledWith('file://fake.jpg');
    expect(mockUpload).toHaveBeenCalledWith(
      'http://localhost:4000/uploads/receipt',
      expect.objectContaining({ fieldName: 'file', mimeType: 'image/jpeg' }),
    );

    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));
    await fireEvent.press(screen.getByTestId('sale-footer-action'));

    await waitFor(() => expect(mockedTrySendSale).toHaveBeenCalledTimes(1));
    expect(mockedTrySendSale.mock.calls[0][0]).toMatchObject({
      paymentProofRef: 'https://cdn.test/proof-1.jpg',
    });
  });

  it('omits paymentProofRef from the Guardar venta payload when no photo was ever picked', async () => {
    mockedTrySendSale.mockResolvedValue('sale-123');

    await renderSaleScreen();
    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));
    await fireEvent.press(screen.getByTestId('sale-footer-action'));

    await waitFor(() => expect(mockedTrySendSale).toHaveBeenCalledTimes(1));
    const payload = mockedTrySendSale.mock.calls[0][0];
    expect(Object.prototype.hasOwnProperty.call(payload, 'paymentProofRef')).toBe(false);
  });
});

describe('NewSaleScreen/ubicacion en el momento de confirmar (point-in-time-geolocation)', () => {
  it('includes latitude/longitude in the Guardar venta payload when permission is granted and the read succeeds', async () => {
    mockedTrySendSale.mockResolvedValue('sale-123');

    await renderSaleScreen();
    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));
    await fireEvent.press(screen.getByTestId('sale-footer-action'));

    await waitFor(() => expect(mockedTrySendSale).toHaveBeenCalledTimes(1));
    expect(mockedTrySendSale.mock.calls[0][0]).toMatchObject({
      latitude: -34.6037,
      longitude: -58.3816,
    });
  });

  it('omits latitude/longitude and still saves the sale when the location permission is denied', async () => {
    mockedRequestForegroundPermissionsAsync.mockResolvedValue({ granted: false });
    mockedTrySendSale.mockResolvedValue('sale-123');

    await renderSaleScreen();
    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));
    await fireEvent.press(screen.getByTestId('sale-footer-action'));

    await waitFor(() => expect(mockedTrySendSale).toHaveBeenCalledTimes(1));
    const payload = mockedTrySendSale.mock.calls[0][0];
    expect(Object.prototype.hasOwnProperty.call(payload, 'latitude')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(payload, 'longitude')).toBe(false);
    expect(mockedGetCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('omits latitude/longitude and still saves the sale when the location read never resolves before the timeout', async () => {
    jest.useFakeTimers();
    try {
      mockedGetCurrentPositionAsync.mockReturnValue(new Promise(() => {}));
      mockedTrySendSale.mockResolvedValue('sale-123');

      await renderSaleScreen();
      await fireEvent.press(screen.getByTestId('product-row-G10-increment'));
      await fireEvent.press(screen.getByTestId('sale-footer-action'));

      await jest.advanceTimersByTimeAsync(8000);

      expect(mockedTrySendSale).toHaveBeenCalledTimes(1);
      const payload = mockedTrySendSale.mock.calls[0][0];
      expect(Object.prototype.hasOwnProperty.call(payload, 'latitude')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(payload, 'longitude')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('NewSaleScreen/elegir cliente (customer-picker-proximity PR2)', () => {
  it('renders a customer card that navigates to CustomerPicker', async () => {
    await render(<NewSaleScreen />);

    await fireEvent.press(screen.getByTestId('new-sale-customer-card'));

    expect(mockedNavigate).toHaveBeenCalledWith('CustomerPicker');
  });

  it('prompts for a customer and blocks the action until one is picked', async () => {
    await render(<NewSaleScreen />);

    expect(screen.getAllByText('Elegí un cliente').length).toBeGreaterThan(0);
    expect(screen.getByTestId('sale-footer-action')).toHaveTextContent('Elegí un cliente');

    await fireEvent.press(screen.getByTestId('sale-footer-action'));
    expect(mockedTrySendSale).not.toHaveBeenCalled();
    expect(mockedEnqueueSale).not.toHaveBeenCalled();
  });

  it('shows the picked customer and its directory type, which the driver cannot change', async () => {
    await renderSaleScreen('Kiosco La Esquina', 'comercio');

    expect(screen.getByText('Kiosco La Esquina')).toBeTruthy();
    expect(screen.getByText('Comercio')).toBeTruthy();
    // El tipo es lo que elige la lista de precios: no hay control para tocarlo.
    expect(screen.queryByPlaceholderText('Nombre del cliente')).toBeNull();
  });

  it('sends customerId, name and type from the picked customer', async () => {
    mockedTrySendSale.mockResolvedValue('sale-123');

    await renderSaleScreen('Kiosco La Esquina', 'comercio');
    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));
    await fireEvent.press(screen.getByTestId('sale-footer-action'));

    await waitFor(() => expect(mockedTrySendSale).toHaveBeenCalledTimes(1));
    expect(mockedTrySendSale.mock.calls[0][0]).toMatchObject({
      customerId: 'cus-1',
      customerName: 'Kiosco La Esquina',
      customerType: 'comercio',
    });
  });
});

// driver-ux-polish (phase 9, Unit 1): a blank customerName used to only be
// caught server-side (400) or, worse, could get stuck forever in the
// offline sync queue with no remediation UI. These tests pin a client-side
// guard -- reusing validateCreateSaleInput/validateUpdateSaleInput/
// validateRecordEmptyVisitInput from @distribuidor/shared, same convention
// as LoadManifestScreen.saveManifest -- in front of every network/
// offline-queue call this screen makes.
// driver-ux-polish (phase 9, Unit 1) pinned a client-side blank-name guard in
// front of every network/offline-queue call. The guard itself is unchanged --
// saveSale still runs validateCreateSaleInput before sending -- but a blank
// name is no longer reachable through the UI: the name comes from the customer
// directory, and without a picked customer the footer action never fires. That
// unreachability is what these tests now pin.
describe('NewSaleScreen/customer is required before anything is sent', () => {
  it('never calls the network or the offline queue without a picked customer', async () => {
    await render(<NewSaleScreen />);

    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));
    await fireEvent.press(screen.getByTestId('sale-footer-action'));

    expect(mockedTrySendSale).not.toHaveBeenCalled();
    expect(mockedEnqueueSale).not.toHaveBeenCalled();
    expect(mockedTrySendEmptyVisit).not.toHaveBeenCalled();
    expect(mockedEnqueueEmptyVisit).not.toHaveBeenCalled();
  });

  it('lets saveSale proceed normally once a customer is picked (happy path unaffected)', async () => {
    mockedTrySendSale.mockResolvedValue('sale-999');

    await renderSaleScreen('Juan Perez');
    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));
    await fireEvent.press(screen.getByTestId('sale-footer-action'));

    await waitFor(() => expect(mockedTrySendSale).toHaveBeenCalledTimes(1));
    expect(mockedTrySendSale.mock.calls[0][0]).toMatchObject({ customerName: 'Juan Perez' });
  });
});

describe('NewSaleScreen — catalogo y precios reales', () => {
  // El bug que cierra toda esta fase: el total lo tiene que decidir la API,
  // no una tabla hardcodeada que puede haber quedado vieja.
  it('prices the sale with the catalogue prices, not a hardcoded table', async () => {
    mockedUseCatalog.mockReturnValue({
      ...baseCatalogValue,
      prices: {
        ...baseCatalogValue.prices,
        final: { ...baseCatalogValue.prices.final, G10: 99000 },
      },
    });

    // La lista de precios la elige el TIPO del cliente, asi que sin cliente
    // elegido no hay precio que mostrar.
    await renderSaleScreen('Cliente de prueba', 'final');
    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));

    // 1 x 99000 con los precios del catalogo. Con la tabla hardcodeada vieja
    // este total habria dado 8500.
    expect(screen.getByTestId('sale-footer-total')).toHaveTextContent('$99.000');
  });

  it('renders one row per active catalogue product, in the admin order', async () => {
    mockedUseCatalog.mockReturnValue({
      ...baseCatalogValue,
      products: [catalogProduct('G45', 0), catalogProduct('G10', 1)],
      prices: baseCatalogValue.prices,
    });

    await render(<NewSaleScreen />);

    expect(screen.getByTestId('product-row-G45-increment')).toBeTruthy();
    expect(screen.getByTestId('product-row-G10-increment')).toBeTruthy();
    expect(screen.queryByTestId('product-row-G15-increment')).toBeNull();
  });

  it('shows the product name, not the bare code', async () => {
    await render(<NewSaleScreen />);

    expect(screen.getByText('Producto G10')).toBeTruthy();
  });

  // Offline con cache: se vende, pero el chofer tiene que VER que el precio
  // puede estar viejo antes de cobrarlo.
  it('warns the driver when the prices came from a stale cache', async () => {
    mockedUseCatalog.mockReturnValue({ ...baseCatalogValue, stale: true });

    await render(<NewSaleScreen />);

    expect(screen.getByTestId('new-sale-stale-prices')).toBeTruthy();
  });

  it('does not warn when the prices are fresh', async () => {
    await render(<NewSaleScreen />);

    expect(screen.queryByTestId('new-sale-stale-prices')).toBeNull();
  });

  // Sin catalogo no hay precio honesto: se bloquea en vez de inventar.
  it('blocks the sale when there is no catalogue at all', async () => {
    mockedUseCatalog.mockReturnValue({
      ...baseCatalogValue,
      products: [],
      prices: null,
      status: 'error' as const,
      canSell: false,
      error: 'No se pudieron cargar los productos y precios.',
    });

    await render(<NewSaleScreen />);

    // El motivo lo lleva el propio boton: un boton gris sin explicacion deja
    // al chofer sin saber que le falta.
    expect(screen.getByTestId('sale-footer-action')).toHaveTextContent('Sin precios — sincronizá');
    expect(screen.getByTestId('sale-footer-action').props.accessibilityState.disabled).toBe(true);
  });
});

describe('NewSaleScreen — occurredAt', () => {
  // La fecha la tiene que poner el telefono: el servidor solo sabe cuando
  // LLEGO la venta. Sin esto una venta encolada se tarifa y se fecha el dia
  // que sincroniza, no el dia que se hizo.
  it('stamps the sale with the moment it happened', async () => {
    mockedTrySendSale.mockResolvedValue('sale-occurred');

    await renderSaleScreen();
    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));
    await fireEvent.press(screen.getByTestId('sale-footer-action'));

    await waitFor(() => expect(mockedTrySendSale).toHaveBeenCalled());
    const payload = mockedTrySendSale.mock.calls[0][0];
    expect(typeof payload.occurredAt).toBe('string');
    expect(Number.isNaN(Date.parse(payload.occurredAt))).toBe(false);
  });

  it('stamps an empty visit too, so it lands on the right day', async () => {
    mockedTrySendEmptyVisit.mockResolvedValue('visit-occurred');

    await renderSaleScreen();
    await fireEvent(
      screen.getByTestId('new-sale-container-returned-switch'),
      'valueChange',
      true,
    );
    await fireEvent.press(screen.getByTestId('sale-footer-action'));

    await waitFor(() => expect(mockedTrySendEmptyVisit).toHaveBeenCalled());
    const payload = mockedTrySendEmptyVisit.mock.calls[0][0];
    expect(typeof payload.occurredAt).toBe('string');
  });
});

describe('NewSaleScreen/header', () => {
  it('numbers the sale being loaded off the sales already closed today', async () => {
    mockedUseSync.mockReturnValue({
      ...baseSyncValue,
      daySummary: { activeCount: 12, canceledCount: 0, activeTotal: 0 },
      trySendSale: mockedTrySendSale,
      enqueueSale: mockedEnqueueSale,
      trySendEmptyVisit: mockedTrySendEmptyVisit,
      enqueueEmptyVisit: mockedEnqueueEmptyVisit,
      refreshDaySummary: mockedRefreshDaySummary,
    });

    await renderSaleScreen();

    expect(screen.getByText('VENTA 13 · CAMION-07')).toBeTruthy();
  });

  it('surfaces the offline queue depth, and hides it when nothing is pending', async () => {
    await renderSaleScreen();
    expect(screen.queryByTestId('sale-header-queued')).toBeNull();

    mockedUseSync.mockReturnValue({
      ...baseSyncValue,
      pendingSales: [{ queueId: 'q1' }, { queueId: 'q2' }],
      trySendSale: mockedTrySendSale,
      enqueueSale: mockedEnqueueSale,
      trySendEmptyVisit: mockedTrySendEmptyVisit,
      enqueueEmptyVisit: mockedEnqueueEmptyVisit,
      refreshDaySummary: mockedRefreshDaySummary,
    });

    await renderSaleScreen();
    expect(screen.getByText('2 EN COLA')).toBeTruthy();
  });
});

// El boton del pie es la unica accion de la pantalla, y su texto es lo que
// explica por que no esta disponible. Cada rama nombra lo que falta resolver.
describe('NewSaleScreen/footer action states', () => {
  it('asks for a customer first', async () => {
    await render(<NewSaleScreen />);

    expect(screen.getByTestId('sale-footer-action')).toHaveTextContent('Elegí un cliente');
  });

  it('asks for products once there is a customer', async () => {
    await renderSaleScreen();

    expect(screen.getByTestId('sale-footer-action')).toHaveTextContent('Agregá productos');
  });

  it('becomes Guardar venta as soon as something is added', async () => {
    await renderSaleScreen();
    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));

    expect(screen.getByTestId('sale-footer-action')).toHaveTextContent('Guardar venta');
  });

  it('keeps the running total in step with the cart', async () => {
    await renderSaleScreen();

    expect(screen.getByTestId('sale-footer-total')).toHaveTextContent('$0');
    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));
    expect(screen.getByTestId('sale-footer-total')).toHaveTextContent('$8.500');
  });

  it('names the missing truck instead of going dead without a reason', async () => {
    mockedUseTruck.mockReturnValue({ ...baseTruckValue, truck: null });

    await renderSaleScreen();

    expect(screen.getByTestId('sale-footer-action')).toHaveTextContent('Sin camión asignado');
  });
});

describe('NewSaleScreen/last sale line', () => {
  it('shows nothing until a sale has been recorded on this screen', async () => {
    await renderSaleScreen();

    expect(screen.queryByTestId('new-sale-last-sale')).toBeNull();
  });

  it('recalls the customer and amount of the sale just recorded', async () => {
    await renderSaleScreen('Marta Suárez');
    await saveOneSale('sale-777');

    expect(screen.getByTestId('new-sale-last-sale')).toHaveTextContent(
      'Última: Marta Suárez · $8.500',
    );
  });
});
