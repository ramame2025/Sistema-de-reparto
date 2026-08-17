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

const mockedUseSync = useSync as jest.Mock;
const mockedUseAuth = useAuth as jest.Mock;

const baseSyncValue = {
  pendingSales: [],
  syncing: false,
  daySummary: { activeCount: 0, canceledCount: 0, activeTotal: 0 },
  summaryLoading: false,
  summaryError: null,
  fallbackTruckCode: 'CAMION-07',
  setFallbackTruckCode: jest.fn(),
  trySendSale: jest.fn(),
  enqueueSale: jest.fn(),
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
let mockedRefreshDaySummary: jest.Mock;
let mockedSetFallbackTruckCode: jest.Mock;
let mockedApiPatch: jest.Mock;

beforeEach(() => {
  mockedTrySendSale = jest.fn();
  mockedEnqueueSale = jest.fn().mockResolvedValue(1);
  mockedRefreshDaySummary = jest.fn().mockResolvedValue(undefined);
  mockedSetFallbackTruckCode = jest.fn();
  mockedApiPatch = jest.fn();

  mockedUseSync.mockReturnValue({
    ...baseSyncValue,
    trySendSale: mockedTrySendSale,
    enqueueSale: mockedEnqueueSale,
    refreshDaySummary: mockedRefreshDaySummary,
    setFallbackTruckCode: mockedSetFallbackTruckCode,
  });
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

describe('NewSaleScreen/fallbackTruckCode binding', () => {
  it('binds the truck code field to SyncContext.fallbackTruckCode', async () => {
    await render(<NewSaleScreen />);

    expect(screen.getByTestId('new-sale-truck-code').props.value).toBe('CAMION-07');

    await fireEvent.changeText(screen.getByTestId('new-sale-truck-code'), 'CAMION-09');

    expect(mockedSetFallbackTruckCode).toHaveBeenCalledWith('CAMION-09');
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
