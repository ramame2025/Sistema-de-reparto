jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../context/AuthContext', () => {
  const actual = jest.requireActual('../context/AuthContext');
  return { ...actual, useAuth: jest.fn() };
});

jest.mock('../context/SyncContext', () => {
  const actual = jest.requireActual('../context/SyncContext');
  return { ...actual, useSync: jest.fn() };
});

const mockedGoBack = jest.fn();
let mockedRouteSale: SaleRecord;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockedGoBack, navigate: jest.fn() }),
  useRoute: () => ({ params: { sale: mockedRouteSale } }),
}));

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import type { SaleRecord } from '@distribuidor/shared';
import { SaleDetailScreen } from './SaleDetailScreen';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';

const mockedUseAuth = useAuth as jest.Mock;
const mockedUseSync = useSync as jest.Mock;
let mockedApiPatch: jest.Mock;
let mockedRefreshDaySummary: jest.Mock;

const buildSale = (overrides: Partial<SaleRecord> = {}): SaleRecord => ({
  id: 's1',
  createdAt: '2026-08-20T14:30:00.000Z',
  occurredAt: '2026-08-20T14:30:00.000Z',
  status: 'active',
  driverName: 'chofer1',
  truckCode: 'C-04',
  total: 15000,
  customerName: 'Kiosco Norte',
  customerType: 'comercio',
  paymentMethod: 'transferencia',
  items: [{ productCode: 'G10', quantity: 2, unitPrice: 7500 }],
  kind: 'sale',
  ...overrides,
});

beforeEach(() => {
  mockedGoBack.mockClear();
  mockedRouteSale = buildSale();
  mockedApiPatch = jest.fn().mockResolvedValue(buildSale());
  mockedRefreshDaySummary = jest.fn().mockResolvedValue(undefined);

  mockedUseAuth.mockReturnValue({
    status: 'authenticated' as const,
    token: 'tok',
    username: 'chofer1',
    loading: false,
    api: { patch: mockedApiPatch },
    login: jest.fn(),
    logout: jest.fn(),
    requireAuthToken: jest.fn(() => 'tok'),
  });

  mockedUseSync.mockReturnValue({ refreshDaySummary: mockedRefreshDaySummary });
});

describe('SaleDetailScreen/detail', () => {
  it('shows the customer, the truck and the recorded total', async () => {
    await render(<SaleDetailScreen />);

    expect(screen.getByText('Kiosco Norte')).toBeTruthy();
    expect(screen.getByText('Comercio')).toBeTruthy();
    expect(screen.getByTestId('sale-detail-total')).toHaveTextContent('$15.000');
    expect(screen.getByText('C-04')).toBeTruthy();
  });

  it('lists the sold items with their quantities', async () => {
    await render(<SaleDetailScreen />);

    expect(screen.getByTestId('product-row-G10-quantity')).toHaveTextContent('2');
  });

  it('labels a churn row as an empty visit and offers no item editing', async () => {
    mockedRouteSale = buildSale({ kind: 'churn', paymentMethod: null, items: [], total: 0 });
    await render(<SaleDetailScreen />);

    expect(screen.getByTestId('sale-detail-churn')).toBeTruthy();
    expect(screen.queryByTestId('sale-detail-save-button')).toBeNull();
  });
});

describe('SaleDetailScreen/cancel', () => {
  it('refuses to cancel without a reason of at least 3 characters', async () => {
    await render(<SaleDetailScreen />);

    await fireEvent.changeText(screen.getByTestId('sale-detail-cancel-reason'), 'ab');
    await fireEvent.press(screen.getByTestId('sale-detail-cancel-button'));

    await waitFor(() =>
      expect(screen.getByText('El motivo de anulacion debe tener al menos 3 caracteres.')).toBeTruthy(),
    );
    expect(mockedApiPatch).not.toHaveBeenCalled();
  });

  it('cancels the sale it was opened on, not the last one loaded in this session', async () => {
    mockedRouteSale = buildSale({ id: 'sale-abc' });
    await render(<SaleDetailScreen />);

    await fireEvent.changeText(
      screen.getByTestId('sale-detail-cancel-reason'),
      'Cliente devolvio',
    );
    await fireEvent.press(screen.getByTestId('sale-detail-cancel-button'));

    await waitFor(() =>
      expect(mockedApiPatch).toHaveBeenCalledWith('/sales/sale-abc/cancel', {
        reason: 'Cliente devolvio',
      }),
    );
  });

  it('refreshes the day summary after a successful cancel', async () => {
    await render(<SaleDetailScreen />);

    await fireEvent.changeText(screen.getByTestId('sale-detail-cancel-reason'), 'Error de carga');
    await fireEvent.press(screen.getByTestId('sale-detail-cancel-button'));

    await waitFor(() => expect(mockedRefreshDaySummary).toHaveBeenCalledTimes(1));
  });

  it('offers no actions on an already canceled sale, and shows why it was canceled', async () => {
    mockedRouteSale = buildSale({
      status: 'canceled',
      canceledAt: '2026-08-20T15:00:00.000Z',
      cancelReason: 'Cliente se arrepintio',
    });
    await render(<SaleDetailScreen />);

    expect(screen.getByText('Cliente se arrepintio')).toBeTruthy();
    expect(screen.queryByTestId('sale-detail-cancel-button')).toBeNull();
    expect(screen.queryByTestId('sale-detail-save-button')).toBeNull();
  });
});

describe('SaleDetailScreen/edit', () => {
  it('refuses to save without a reason of at least 3 characters', async () => {
    await render(<SaleDetailScreen />);

    await fireEvent.changeText(screen.getByTestId('sale-detail-edit-reason'), 'ab');
    await fireEvent.press(screen.getByTestId('sale-detail-save-button'));

    await waitFor(() =>
      expect(screen.getByText('El motivo de edicion debe tener al menos 3 caracteres.')).toBeTruthy(),
    );
    expect(mockedApiPatch).not.toHaveBeenCalled();
  });

  it('sends the edited quantities of the sale it was opened on', async () => {
    mockedRouteSale = buildSale({ id: 'sale-xyz' });
    await render(<SaleDetailScreen />);

    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));
    await fireEvent.changeText(
      screen.getByTestId('sale-detail-edit-reason'),
      'Correccion de carga',
    );
    await fireEvent.press(screen.getByTestId('sale-detail-save-button'));

    await waitFor(() => expect(mockedApiPatch).toHaveBeenCalledTimes(1));
    const [path, payload] = mockedApiPatch.mock.calls[0];
    expect(path).toBe('/sales/sale-xyz');
    expect(payload.items).toEqual([{ productCode: 'G10', quantity: 3 }]);
    expect(payload.reason).toBe('Correccion de carga');
    expect(payload.customerName).toBe('Kiosco Norte');
    expect(payload.customerType).toBe('comercio');
  });

  it('drops an item taken down to zero instead of sending a zero quantity', async () => {
    mockedRouteSale = buildSale({
      items: [
        { productCode: 'G10', quantity: 1, unitPrice: 7500 },
        { productCode: 'G15', quantity: 2, unitPrice: 12600 },
      ],
    });
    await render(<SaleDetailScreen />);

    await fireEvent.press(screen.getByTestId('product-row-G10-decrement'));
    await fireEvent.changeText(screen.getByTestId('sale-detail-edit-reason'), 'Saco una');
    await fireEvent.press(screen.getByTestId('sale-detail-save-button'));

    await waitFor(() => expect(mockedApiPatch).toHaveBeenCalledTimes(1));
    expect(mockedApiPatch.mock.calls[0][1].items).toEqual([
      { productCode: 'G15', quantity: 2 },
    ]);
  });

  it('refuses to save a sale left with no items', async () => {
    mockedRouteSale = buildSale({ items: [{ productCode: 'G10', quantity: 1, unitPrice: 7500 }] });
    await render(<SaleDetailScreen />);

    await fireEvent.press(screen.getByTestId('product-row-G10-decrement'));
    await fireEvent.changeText(screen.getByTestId('sale-detail-edit-reason'), 'Vacio');
    await fireEvent.press(screen.getByTestId('sale-detail-save-button'));

    await waitFor(() =>
      expect(screen.getByText('La venta tiene que quedar con al menos un producto.')).toBeTruthy(),
    );
    expect(mockedApiPatch).not.toHaveBeenCalled();
  });

  it('sends the edited payment method', async () => {
    await render(<SaleDetailScreen />);

    await fireEvent.press(screen.getByTestId('sale-detail-payment-efectivo'));
    await fireEvent.changeText(screen.getByTestId('sale-detail-edit-reason'), 'Pago en efectivo');
    await fireEvent.press(screen.getByTestId('sale-detail-save-button'));

    await waitFor(() => expect(mockedApiPatch).toHaveBeenCalledTimes(1));
    expect(mockedApiPatch.mock.calls[0][1].paymentMethod).toBe('efectivo');
  });

  it('keeps the sale linked to its customer when editing', async () => {
    mockedRouteSale = buildSale({ customerId: 'cus-9' } as Partial<SaleRecord>);
    await render(<SaleDetailScreen />);

    await fireEvent.changeText(screen.getByTestId('sale-detail-edit-reason'), 'Correccion');
    await fireEvent.press(screen.getByTestId('sale-detail-save-button'));

    await waitFor(() => expect(mockedApiPatch).toHaveBeenCalledTimes(1));
    expect(mockedApiPatch.mock.calls[0][1].customerId).toBe('cus-9');
  });

  it('shows the running total as the driver edits, before saving', async () => {
    await render(<SaleDetailScreen />);

    expect(screen.getByTestId('sale-detail-total')).toHaveTextContent('$15.000');
    await fireEvent.press(screen.getByTestId('product-row-G10-increment'));
    expect(screen.getByTestId('sale-detail-total')).toHaveTextContent('$22.500');
  });
});
