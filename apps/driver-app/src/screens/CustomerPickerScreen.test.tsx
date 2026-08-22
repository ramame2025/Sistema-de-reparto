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
import type { CustomerRecord } from '@distribuidor/shared';
import { CustomerPickerScreen } from './CustomerPickerScreen';
import { useAuth } from '../context/AuthContext';

const mockedUseAuth = useAuth as jest.Mock;
let mockedApiGet: jest.Mock;

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

beforeEach(() => {
  mockedNavigate.mockClear();
  mockedApiGet = jest.fn().mockResolvedValue(customers);
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
