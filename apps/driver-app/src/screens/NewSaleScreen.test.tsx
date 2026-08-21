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

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { NewSaleScreen } from './NewSaleScreen';
import { useSync } from '../context/SyncContext';
import { useAuth } from '../context/AuthContext';
import { useTruck } from '../context/TruckContext';

const mockedUseSync = useSync as jest.Mock;
const mockedUseAuth = useAuth as jest.Mock;
const mockedUseTruck = useTruck as jest.Mock;

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

let mockedTrySendSale: jest.Mock;
let mockedEnqueueSale: jest.Mock;
let mockedTrySendEmptyVisit: jest.Mock;
let mockedEnqueueEmptyVisit: jest.Mock;
let mockedRefreshDaySummary: jest.Mock;
let mockedApiPatch: jest.Mock;

beforeEach(() => {
  mockedTrySendSale = jest.fn();
  mockedEnqueueSale = jest.fn().mockResolvedValue(1);
  mockedTrySendEmptyVisit = jest.fn();
  mockedEnqueueEmptyVisit = jest.fn().mockResolvedValue(1);
  mockedRefreshDaySummary = jest.fn().mockResolvedValue(undefined);
  mockedApiPatch = jest.fn();

  mockedUseSync.mockReturnValue({
    ...baseSyncValue,
    trySendSale: mockedTrySendSale,
    enqueueSale: mockedEnqueueSale,
    trySendEmptyVisit: mockedTrySendEmptyVisit,
    enqueueEmptyVisit: mockedEnqueueEmptyVisit,
    refreshDaySummary: mockedRefreshDaySummary,
  });
  mockedUseTruck.mockReturnValue(baseTruckValue);
  mockedUseAuth.mockReturnValue({
    ...baseAuthValue,
    api: { patch: mockedApiPatch },
  });
});

const saveOneSale = async (saleId: string) => {
  mockedTrySendSale.mockResolvedValueOnce(saleId);
  await fireEvent.press(screen.getByTestId('new-sale-qty-increment-G10'));
  await fireEvent.press(screen.getByText('Guardar venta'));
  await waitFor(() => expect(screen.getAllByText(`ID ultima venta: ${saleId}`)).toHaveLength(2));
};

describe('NewSaleScreen/online success', () => {
  it('submits, resets the form, refreshes the summary, and shows success feedback', async () => {
    mockedTrySendSale.mockResolvedValue('sale-123');

    await render(<NewSaleScreen />);
    await fireEvent.press(screen.getByTestId('new-sale-qty-increment-G10'));
    await fireEvent.press(screen.getByText('Guardar venta'));

    await waitFor(() => expect(mockedTrySendSale).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Venta guardada correctamente. ID: sale-123')).toBeTruthy();
    expect(screen.getAllByText('ID ultima venta: sale-123')).toHaveLength(2);
    expect(screen.getByText('Total: $0')).toBeTruthy();
    expect(mockedRefreshDaySummary).toHaveBeenCalledTimes(1);
  });
});

describe('NewSaleScreen/offline fallback', () => {
  it('falls back to enqueueSale with a cause when trySendSale fails, showing distinct feedback', async () => {
    mockedTrySendSale.mockRejectedValue(new Error('Network request failed'));

    await render(<NewSaleScreen />);
    await fireEvent.press(screen.getByTestId('new-sale-qty-increment-G15'));
    await fireEvent.press(screen.getByText('Guardar venta'));

    await waitFor(() => expect(mockedEnqueueSale).toHaveBeenCalledTimes(1));
    expect(mockedEnqueueSale).toHaveBeenCalledWith(
      expect.objectContaining({ items: [{ productCode: 'G15', quantity: 1 }] }),
      'Network request failed',
    );
    expect(screen.getByText('Sin conexion. Venta en cola offline (1 pendientes).')).toBeTruthy();
    expect(screen.getByText('Total: $0')).toBeTruthy();
  });
});

describe('NewSaleScreen/product quantities', () => {
  it('updates the derived total via calculateSaleTotal as steppers change', async () => {
    await render(<NewSaleScreen />);

    await fireEvent.press(screen.getByTestId('new-sale-qty-increment-G10'));
    expect(screen.getByText('Total: $8.500')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('new-sale-qty-increment-G10'));
    expect(screen.getByText('Total: $17.000')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('new-sale-qty-decrement-G10'));
    expect(screen.getByText('Total: $8.500')).toBeTruthy();
  });
});

describe('NewSaleScreen/camion asignado', () => {
  it('shows the assigned truck read-only, with no free-text input to type it', async () => {
    await render(<NewSaleScreen />);

    expect(screen.getByTestId('new-sale-assigned-truck')).toBeTruthy();
    expect(screen.getByText(/CAMION-07/)).toBeTruthy();
    // El camion ya no se escribe: sale de la asignacion.
    expect(screen.queryByTestId('new-sale-truck-code')).toBeNull();
  });

  it('sends truckId and truckCode from the assignment, not from anything the driver typed', async () => {
    await render(<NewSaleScreen />);

    await fireEvent.press(screen.getByTestId('new-sale-qty-increment-G10'));
    await fireEvent.press(screen.getByText('Guardar venta'));

    await waitFor(() => expect(mockedTrySendSale).toHaveBeenCalled());
    expect(mockedTrySendSale.mock.calls[0][0]).toMatchObject({
      truckId: 'truck-1',
      truckCode: 'CAMION-07',
    });
  });

  it('blocks the sale and explains why when the driver has no truck today', async () => {
    // Sin camion no se puede cargar una venta: quedaria sin unidad asignada.
    mockedUseTruck.mockReturnValue({ ...baseTruckValue, truck: null });

    await render(<NewSaleScreen />);

    await fireEvent.press(screen.getByTestId('new-sale-qty-increment-G10'));
    await fireEvent.press(screen.getByText('Guardar venta'));

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

    await render(<NewSaleScreen />);

    expect(screen.getByTestId('new-sale-truck-error')).toBeTruthy();
    expect(screen.queryByTestId('new-sale-no-truck')).toBeNull();
  });
});

describe('NewSaleScreen/cancel last sale', () => {
  it('requires a non-empty cancelReason before calling the cancel endpoint', async () => {
    await render(<NewSaleScreen />);
    await saveOneSale('sale-123');

    await fireEvent.press(screen.getByTestId('new-sale-cancel-button'));

    await waitFor(() =>
      expect(
        screen.getByText('El motivo de anulacion debe tener al menos 3 caracteres.'),
      ).toBeTruthy(),
    );
    expect(mockedApiPatch).not.toHaveBeenCalled();
  });

  it('calls the cancel endpoint via api and shows success feedback', async () => {
    mockedApiPatch.mockResolvedValue({});

    await render(<NewSaleScreen />);
    await saveOneSale('sale-123');

    await fireEvent.changeText(
      screen.getByPlaceholderText('Motivo de anulacion'),
      'Cliente cancelo el pedido',
    );
    await fireEvent.press(screen.getByTestId('new-sale-cancel-button'));

    await waitFor(() =>
      expect(mockedApiPatch).toHaveBeenCalledWith('/sales/sale-123/cancel', {
        reason: 'Cliente cancelo el pedido',
      }),
    );
    expect(screen.getByText('Venta anulada correctamente.')).toBeTruthy();
    expect(mockedRefreshDaySummary).toHaveBeenCalledTimes(2);
  });
});

describe('NewSaleScreen/edit last sale', () => {
  it('requires a non-empty editReason before calling the update endpoint', async () => {
    await render(<NewSaleScreen />);
    await saveOneSale('sale-123');

    await fireEvent.changeText(screen.getByPlaceholderText('Motivo de edicion'), '');
    await fireEvent.press(screen.getByTestId('new-sale-edit-button'));

    await waitFor(() =>
      expect(
        screen.getByText('El motivo de edicion debe tener al menos 3 caracteres.'),
      ).toBeTruthy(),
    );
    expect(mockedApiPatch).not.toHaveBeenCalled();
  });

  it('calls the update endpoint via api and shows success feedback', async () => {
    mockedApiPatch.mockResolvedValue({});

    await render(<NewSaleScreen />);
    await saveOneSale('sale-123');
    await fireEvent.press(screen.getByTestId('new-sale-qty-increment-G10'));

    await fireEvent.press(screen.getByTestId('new-sale-edit-button'));

    await waitFor(() =>
      expect(mockedApiPatch).toHaveBeenCalledWith(
        '/sales/sale-123',
        expect.objectContaining({ reason: 'Correccion de carga', driverName: 'chofer1' }),
      ),
    );
    expect(screen.getByText('Venta editada correctamente.')).toBeTruthy();
  });
});

describe('NewSaleScreen/envase devuelto toggle (visit-container-model Unit 4)', () => {
  it('renders unmarked by default and flips state when pressed', async () => {
    await render(<NewSaleScreen />);

    const toggle = screen.getByTestId('new-sale-container-returned-toggle');
    expect(toggle).toBeTruthy();
    expect(screen.getByText('Envase devuelto: sin marcar')).toBeTruthy();

    await fireEvent.press(toggle);
    expect(screen.getByText('Envase devuelto: si')).toBeTruthy();

    await fireEvent.press(toggle);
    expect(screen.getByText('Envase devuelto: no')).toBeTruthy();
  });

  it('omits containerReturned from the Guardar venta payload when never touched', async () => {
    mockedTrySendSale.mockResolvedValue('sale-123');

    await render(<NewSaleScreen />);
    await fireEvent.press(screen.getByTestId('new-sale-qty-increment-G10'));
    await fireEvent.press(screen.getByText('Guardar venta'));

    await waitFor(() => expect(mockedTrySendSale).toHaveBeenCalledTimes(1));
    const payload = mockedTrySendSale.mock.calls[0][0];
    expect(Object.prototype.hasOwnProperty.call(payload, 'containerReturned')).toBe(false);
  });

  it('includes containerReturned:true in the Guardar venta payload once toggled on', async () => {
    mockedTrySendSale.mockResolvedValue('sale-123');

    await render(<NewSaleScreen />);
    await fireEvent.press(screen.getByTestId('new-sale-container-returned-toggle'));
    await fireEvent.press(screen.getByTestId('new-sale-qty-increment-G10'));
    await fireEvent.press(screen.getByText('Guardar venta'));

    await waitFor(() => expect(mockedTrySendSale).toHaveBeenCalledTimes(1));
    expect(mockedTrySendSale.mock.calls[0][0]).toMatchObject({ containerReturned: true });
  });
});

describe('NewSaleScreen/registrar visita sin venta (churn, visit-container-model Unit 4)', () => {
  it('renders as a distinct, separately labeled action from Guardar venta', async () => {
    await render(<NewSaleScreen />);

    expect(screen.getByTestId('new-sale-record-visit-button')).toBeTruthy();
    expect(screen.getByText('Registrar visita sin venta')).toBeTruthy();
  });

  it('does not require any items loaded, unlike Guardar venta', async () => {
    mockedTrySendEmptyVisit.mockResolvedValue('visit-1');

    await render(<NewSaleScreen />);
    // No qty increment pressed -- zero items in the cart.
    await fireEvent.press(screen.getByTestId('new-sale-record-visit-button'));

    await waitFor(() => expect(mockedTrySendEmptyVisit).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Agrega al menos un producto antes de guardar.')).toBeNull();
  });

  it('calls trySendEmptyVisit with an items/paymentMethod-free payload and shows a distinct confirmation', async () => {
    mockedTrySendEmptyVisit.mockResolvedValue('visit-1');

    await render(<NewSaleScreen />);
    await fireEvent.press(screen.getByTestId('new-sale-record-visit-button'));

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

    await render(<NewSaleScreen />);
    await fireEvent.press(screen.getByTestId('new-sale-record-visit-button'));

    await waitFor(() => expect(mockedEnqueueEmptyVisit).toHaveBeenCalledTimes(1));
    expect(mockedEnqueueEmptyVisit).toHaveBeenCalledWith(
      expect.objectContaining({ driverName: 'chofer1' }),
      'Network request failed',
    );
    expect(
      screen.getByText('Sin conexion. Visita sin venta en cola offline (1 pendientes).'),
    ).toBeTruthy();
  });

  it('blocks the visit and explains why when the driver has no truck today, same guard as saveSale', async () => {
    mockedUseTruck.mockReturnValue({ ...baseTruckValue, truck: null });

    await render(<NewSaleScreen />);
    await fireEvent.press(screen.getByTestId('new-sale-record-visit-button'));

    expect(mockedTrySendEmptyVisit).not.toHaveBeenCalled();
    expect(mockedEnqueueEmptyVisit).not.toHaveBeenCalled();
    expect(screen.getByTestId('new-sale-no-truck')).toBeTruthy();
  });
});
