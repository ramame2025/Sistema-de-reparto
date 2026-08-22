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
import { AssignedCustomersScreen } from './AssignedCustomersScreen';
import { useAuth } from '../context/AuthContext';
import { localDay } from '../context/TruckContext';

const mockedUseAuth = useAuth as jest.Mock;
let mockedApiGet: jest.Mock;

beforeEach(() => {
  mockedApiGet = jest.fn();
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

describe('AssignedCustomersScreen/fetch', () => {
  it('fetches the assigned list for today on mount', async () => {
    mockedApiGet.mockResolvedValue({ date: '2026-08-21', customers: [] });

    await render(<AssignedCustomersScreen />);

    await waitFor(() =>
      expect(mockedApiGet).toHaveBeenCalledWith(
        `/driver-customer-assignments/me?date=${localDay()}`,
        { cache: 'no-store' },
      ),
    );
  });

  it('renders the fetched customers list (name + type)', async () => {
    mockedApiGet.mockResolvedValue({
      date: '2026-08-21',
      customers: [
        {
          id: 'c1',
          name: 'Kiosco Norte',
          customerType: 'comercio',
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'c2',
          name: 'Juan Perez',
          customerType: 'final',
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    await render(<AssignedCustomersScreen />);

    await waitFor(() => expect(screen.getByText('Kiosco Norte')).toBeTruthy());
    expect(screen.getByText('comercio')).toBeTruthy();
    expect(screen.getByText('Juan Perez')).toBeTruthy();
    expect(screen.getByText('final')).toBeTruthy();
  });

  it('shows a loading indicator while the fetch is in flight', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    mockedApiGet.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    await render(<AssignedCustomersScreen />);

    expect(screen.getByTestId('assigned-customers-loading')).toBeTruthy();

    resolveFetch({ date: '2026-08-21', customers: [] });
    await waitFor(() => expect(screen.queryByTestId('assigned-customers-loading')).toBeNull());
  });
});

describe('AssignedCustomersScreen/empty', () => {
  it('shows an explicit empty state when there are no assigned customers today', async () => {
    mockedApiGet.mockResolvedValue({ date: '2026-08-21', customers: [] });

    await render(<AssignedCustomersScreen />);

    await waitFor(() =>
      expect(screen.getByText('No tenes clientes asignados hoy')).toBeTruthy(),
    );
  });
});

describe('AssignedCustomersScreen/error', () => {
  it('shows a visible error banner when the fetch fails, without crashing', async () => {
    mockedApiGet.mockRejectedValue(new Error('No se pudo conectar con el servidor.'));

    await render(<AssignedCustomersScreen />);

    await waitFor(() =>
      expect(screen.getByText('No se pudo conectar con el servidor.')).toBeTruthy(),
    );
    expect(screen.queryByText('No tenes clientes asignados hoy')).toBeNull();
  });
});
