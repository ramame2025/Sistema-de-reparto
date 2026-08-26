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
import type { ExpenseRecord } from '@distribuidor/shared';
import { ExpensesHistoryScreen } from './ExpensesHistoryScreen';
import { useAuth } from '../context/AuthContext';

const mockedUseAuth = useAuth as jest.Mock;
let mockedApiGet: jest.Mock;

const buildExpense = (overrides: Partial<ExpenseRecord> = {}): ExpenseRecord => ({
  id: 'e1',
  createdAt: '2026-08-20T11:00:00.000Z',
  driverName: 'chofer1',
  category: 'combustible',
  amount: 12000,
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

describe('ExpensesHistoryScreen/fetch', () => {
  it('fetches the driver expense list on mount, bypassing cache', async () => {
    await render(<ExpensesHistoryScreen />);

    await waitFor(() =>
      expect(mockedApiGet).toHaveBeenCalledWith('/expenses/mine', { cache: 'no-store' }),
    );
  });

  it('renders one row per expense with category and amount', async () => {
    mockedApiGet.mockResolvedValue([
      buildExpense({ id: 'e1', category: 'combustible', amount: 12000 }),
      buildExpense({ id: 'e2', category: 'peaje', amount: 1500 }),
    ]);

    await render(<ExpensesHistoryScreen />);

    await waitFor(() => expect(screen.getByText('Combustible')).toBeTruthy());
    expect(screen.getByText('Peaje')).toBeTruthy();
    expect(screen.getByText('$12.000')).toBeTruthy();
    expect(screen.getByText('$1.500')).toBeTruthy();
  });

  it('shows the expense date on each row', async () => {
    mockedApiGet.mockResolvedValue([buildExpense({ id: 'e1' })]);

    await render(<ExpensesHistoryScreen />);

    await waitFor(() => expect(screen.getByTestId('expenses-history-row-e1')).toBeTruthy());
    expect(screen.getByTestId('expenses-history-row-e1')).toHaveTextContent(/\d{2}\/\d{2}/);
  });

  it('shows the note when the expense has one', async () => {
    mockedApiGet.mockResolvedValue([buildExpense({ id: 'e1', note: 'Carga en YPF ruta 8' })]);

    await render(<ExpensesHistoryScreen />);

    await waitFor(() => expect(screen.getByText('Carga en YPF ruta 8')).toBeTruthy());
  });

  it('flags an expense that has a receipt attached', async () => {
    mockedApiGet.mockResolvedValue([
      buildExpense({ id: 'e1', receiptRef: 'https://cdn.test/receipt-1.jpg' }),
    ]);

    await render(<ExpensesHistoryScreen />);

    await waitFor(() => expect(screen.getByTestId('expenses-history-receipt-e1')).toBeTruthy());
  });

  it('does not flag a receipt when the expense has none', async () => {
    mockedApiGet.mockResolvedValue([buildExpense({ id: 'e1', receiptRef: undefined })]);

    await render(<ExpensesHistoryScreen />);

    await waitFor(() => expect(screen.getByTestId('expenses-history-row-e1')).toBeTruthy());
    expect(screen.queryByTestId('expenses-history-receipt-e1')).toBeNull();
  });

  it('shows a loading indicator while the fetch is in flight', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    mockedApiGet.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    await render(<ExpensesHistoryScreen />);

    expect(screen.getByTestId('expenses-history-loading')).toBeTruthy();

    resolveFetch([]);
    await waitFor(() => expect(screen.queryByTestId('expenses-history-loading')).toBeNull());
  });
});

describe('ExpensesHistoryScreen/empty', () => {
  it('shows an explicit empty state when the driver has no expenses yet', async () => {
    mockedApiGet.mockResolvedValue([]);

    await render(<ExpensesHistoryScreen />);

    await waitFor(() => expect(screen.getByText('Todavía no registraste gastos')).toBeTruthy());
  });
});

describe('ExpensesHistoryScreen/error', () => {
  it('shows a visible error banner when the fetch fails, without crashing', async () => {
    mockedApiGet.mockRejectedValue(new Error('No se pudo conectar con el servidor.'));

    await render(<ExpensesHistoryScreen />);

    await waitFor(() =>
      expect(screen.getByText('No se pudo conectar con el servidor.')).toBeTruthy(),
    );
    expect(screen.queryByText('Todavía no registraste gastos')).toBeNull();
  });
});
