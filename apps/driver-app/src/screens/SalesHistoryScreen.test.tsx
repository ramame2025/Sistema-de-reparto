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

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import type { SaleRecord } from '@distribuidor/shared';
import { SalesHistoryScreen } from './SalesHistoryScreen';
import { useAuth } from '../context/AuthContext';

const mockedUseAuth = useAuth as jest.Mock;
let mockedApiGet: jest.Mock;

const buildSale = (overrides: Partial<SaleRecord> = {}): SaleRecord => ({
  id: 's1',
  createdAt: '2026-08-20T14:30:00.000Z',
  occurredAt: '2026-08-20T14:30:00.000Z',
  status: 'active',
  driverName: 'chofer1',
  total: 15000,
  customerName: 'Kiosco Norte',
  customerType: 'comercio',
  paymentMethod: 'transferencia',
  items: [{ productCode: 'G10', quantity: 2, unitPrice: 7500 }],
  kind: 'sale',
  ...overrides,
});

beforeEach(() => {
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

describe('SalesHistoryScreen/fetch', () => {
  it('fetches the full driver sales list on mount, bypassing cache', async () => {
    await render(<SalesHistoryScreen />);

    await waitFor(() =>
      expect(mockedApiGet).toHaveBeenCalledWith('/sales/mine', { cache: 'no-store' }),
    );
  });

  it('renders one row per sale with customer, total and payment method', async () => {
    mockedApiGet.mockResolvedValue([
      buildSale({ id: 's1', customerName: 'Kiosco Norte', total: 15000, paymentMethod: 'transferencia' }),
      buildSale({ id: 's2', customerName: 'Juan Perez', total: 8000, paymentMethod: 'efectivo' }),
    ]);

    await render(<SalesHistoryScreen />);

    await waitFor(() => expect(screen.getByText('Kiosco Norte')).toBeTruthy());
    expect(screen.getByText('Juan Perez')).toBeTruthy();
    expect(screen.getByText('$15.000')).toBeTruthy();
    expect(screen.getByText('$8.000')).toBeTruthy();
    expect(screen.getByText('Transferencia')).toBeTruthy();
    expect(screen.getByText('Efectivo')).toBeTruthy();
  });

  it('shows the sale date on each row', async () => {
    mockedApiGet.mockResolvedValue([buildSale({ id: 's1' })]);

    await render(<SalesHistoryScreen />);

    await waitFor(() => expect(screen.getByTestId('sales-history-row-s1')).toBeTruthy());
    expect(screen.getByTestId('sales-history-row-s1')).toHaveTextContent(/\d{2}\/\d{2}/);
  });

  it('marks a canceled sale so the driver can tell it apart', async () => {
    mockedApiGet.mockResolvedValue([
      buildSale({ id: 's1', status: 'canceled', cancelReason: 'Cliente se arrepintió' }),
    ]);

    await render(<SalesHistoryScreen />);

    await waitFor(() => expect(screen.getByText('Anulada')).toBeTruthy());
  });

  it('marks a churn visit (returned container, no sale) distinctly', async () => {
    mockedApiGet.mockResolvedValue([
      buildSale({ id: 's1', kind: 'churn', paymentMethod: null, total: 0, items: [] }),
    ]);

    await render(<SalesHistoryScreen />);

    await waitFor(() => expect(screen.getByText('Devolución de envase')).toBeTruthy());
  });

  it('shows a loading indicator while the fetch is in flight', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    mockedApiGet.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    await render(<SalesHistoryScreen />);

    expect(screen.getByTestId('sales-history-loading')).toBeTruthy();

    resolveFetch([]);
    await waitFor(() => expect(screen.queryByTestId('sales-history-loading')).toBeNull());
  });
});

describe('SalesHistoryScreen/empty', () => {
  it('shows an explicit empty state when the driver has no sales yet', async () => {
    mockedApiGet.mockResolvedValue([]);

    await render(<SalesHistoryScreen />);

    await waitFor(() => expect(screen.getByText('Todavía no registraste ventas')).toBeTruthy());
  });
});

describe('SalesHistoryScreen/error', () => {
  it('shows a visible error banner when the fetch fails, without crashing', async () => {
    mockedApiGet.mockRejectedValue(new Error('No se pudo conectar con el servidor.'));

    await render(<SalesHistoryScreen />);

    await waitFor(() =>
      expect(screen.getByText('No se pudo conectar con el servidor.')).toBeTruthy(),
    );
    expect(screen.queryByText('Todavía no registraste ventas')).toBeNull();
  });
});
