jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../context/AuthContext', () => {
  const actual = jest.requireActual('../context/AuthContext');
  return { ...actual, useAuth: jest.fn() };
});

const mockedNavigate = jest.fn();
let mockedParams: { category: string; amount: number; hasReceipt: boolean };

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockedNavigate }),
  useRoute: () => ({ params: mockedParams }),
  // useFocusEffect corre el efecto una vez, como haria al enfocar la pantalla.
  useFocusEffect: (effect: () => void) => {
    const React = require('react');
    React.useEffect(effect, [effect]);
  },
}));

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import type { ExpenseRecord } from '@distribuidor/shared';
import { ExpenseResultScreen } from './ExpenseResultScreen';
import { useAuth } from '../context/AuthContext';

const mockedUseAuth = useAuth as jest.Mock;
let mockedApiGet: jest.Mock;

const today = () => new Date().toISOString().slice(0, 10);

const build = (overrides: Partial<ExpenseRecord> = {}): ExpenseRecord => ({
  id: 'e1',
  createdAt: `${today()}T08:02:00.000Z`,
  driverName: 'chofer1',
  category: 'combustible',
  amount: 45000,
  ...overrides,
});

const authWith = (get: jest.Mock) =>
  mockedUseAuth.mockReturnValue({
    status: 'authenticated' as const,
    token: 'tok',
    username: 'chofer1',
    loading: false,
    api: { get },
    login: jest.fn(),
    logout: jest.fn(),
    requireAuthToken: jest.fn(() => 'tok'),
  });

beforeEach(() => {
  mockedNavigate.mockClear();
  mockedParams = { category: 'combustible', amount: 45000, hasReceipt: true };
  mockedApiGet = jest.fn().mockResolvedValue([]);
  authWith(mockedApiGet);
});

describe('ExpenseResultScreen/confirmacion', () => {
  it('confirms the expense that was just saved, with its receipt status', async () => {
    await render(<ExpenseResultScreen />);

    expect(screen.getByText('Gasto guardado')).toBeTruthy();
    expect(screen.getByTestId('expense-result-saved-detail')).toHaveTextContent(
      'Combustible · $45.000 · con ticket',
    );
  });

  it('says so plainly when it was saved without a ticket', async () => {
    mockedParams = { category: 'peaje', amount: 2300, hasReceipt: false };

    await render(<ExpenseResultScreen />);

    expect(screen.getByTestId('expense-result-saved-detail')).toHaveTextContent(
      'Peaje · $2.300 · sin ticket',
    );
  });

  it('goes back to a clean form for the next expense', async () => {
    await render(<ExpenseResultScreen />);
    await fireEvent.press(screen.getByTestId('expense-result-new'));

    expect(mockedNavigate).toHaveBeenCalledWith('Expenses');
  });
});

describe('ExpenseResultScreen/el dia', () => {
  it('adds up what was spent today and counts the entries', async () => {
    mockedApiGet = jest.fn().mockResolvedValue([
      build({ id: 'a', amount: 45000, receiptRef: 'https://cdn/a.jpg' }),
      build({ id: 'b', amount: 2300, category: 'peaje' }),
      build({ id: 'c', amount: 9800, category: 'comida', receiptRef: 'https://cdn/c.jpg' }),
    ]);
    authWith(mockedApiGet);

    await render(<ExpenseResultScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('expense-result-header-amount')).toHaveTextContent('$57.100'),
    );
    expect(screen.getByText('3 gastos · 1 sin comprobante')).toBeTruthy();
  });

  it('does not mention missing receipts when every expense has one', async () => {
    mockedApiGet = jest
      .fn()
      .mockResolvedValue([build({ id: 'a', receiptRef: 'https://cdn/a.jpg' })]);
    authWith(mockedApiGet);

    await render(<ExpenseResultScreen />);

    await waitFor(() => expect(screen.getByText('1 gasto')).toBeTruthy());
  });

  it('lists today expenses, flagging the one still missing its receipt', async () => {
    mockedApiGet = jest.fn().mockResolvedValue([
      build({ id: 'a', receiptRef: 'https://cdn/a.jpg', note: 'YPF Ruta 8' }),
      build({ id: 'b', category: 'peaje', amount: 2300 }),
    ]);
    authWith(mockedApiGet);

    await render(<ExpenseResultScreen />);

    await waitFor(() => expect(screen.getByTestId('expense-result-row-a')).toBeTruthy());
    expect(screen.getByTestId('expense-result-row-a-detail')).toHaveTextContent(/YPF Ruta 8/);
    expect(screen.getByText('Falta el comprobante')).toBeTruthy();
  });

  it('leaves yesterday out of today list but keeps it in the week total', async () => {
    mockedApiGet = jest.fn().mockResolvedValue([
      build({ id: 'hoy', amount: 100 }),
      build({ id: 'ayer', amount: 200, createdAt: new Date(Date.now() - 86400000).toISOString() }),
    ]);
    authWith(mockedApiGet);

    await render(<ExpenseResultScreen />);

    await waitFor(() => expect(screen.getByTestId('expense-result-row-hoy')).toBeTruthy());
    expect(screen.queryByTestId('expense-result-row-ayer')).toBeNull();
    expect(screen.getByTestId('expense-result-week')).toHaveTextContent('$300');
  });

  it('navigates to the full history', async () => {
    await render(<ExpenseResultScreen />);
    await fireEvent.press(screen.getByTestId('expense-result-history-cta'));

    expect(mockedNavigate).toHaveBeenCalledWith('ExpensesHistory');
  });

  it('shows a visible error without hiding the confirmation of what was saved', async () => {
    mockedApiGet = jest.fn().mockRejectedValue(new Error('No se pudieron cargar tus gastos.'));
    authWith(mockedApiGet);

    await render(<ExpenseResultScreen />);

    await waitFor(() => expect(screen.getByText('No se pudieron cargar tus gastos.')).toBeTruthy());
    // Lo que el chofer acaba de hacer no puede desaparecer porque falle una
    // lectura posterior.
    expect(screen.getByText('Gasto guardado')).toBeTruthy();
  });
});
