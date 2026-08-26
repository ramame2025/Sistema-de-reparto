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
import type { LoadManifestRecord } from '@distribuidor/shared';
import { ManifestHistoryScreen } from './ManifestHistoryScreen';
import { useAuth } from '../context/AuthContext';

const mockedUseAuth = useAuth as jest.Mock;
let mockedApiGet: jest.Mock;

const buildManifest = (overrides: Partial<LoadManifestRecord> = {}): LoadManifestRecord => ({
  id: 'm1',
  createdAt: '2026-08-20T09:00:00.000Z',
  driverName: 'chofer1',
  truckId: 'truck-1',
  truckCode: 'CAMION-01',
  items: [
    { productCode: 'G10', quantity: 5 },
    { productCode: 'G15', quantity: 3 },
  ],
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

describe('ManifestHistoryScreen/fetch', () => {
  it('fetches the full driver manifest list on mount, bypassing cache', async () => {
    await render(<ManifestHistoryScreen />);

    await waitFor(() =>
      expect(mockedApiGet).toHaveBeenCalledWith('/load-manifests/mine', { cache: 'no-store' }),
    );
  });

  it('renders one row per manifest with truck code and total cylinders', async () => {
    mockedApiGet.mockResolvedValue([
      buildManifest({
        id: 'm1',
        truckCode: 'CAMION-01',
        items: [
          { productCode: 'G10', quantity: 5 },
          { productCode: 'G15', quantity: 3 },
        ],
      }),
      buildManifest({
        id: 'm2',
        truckCode: 'CAMION-09',
        items: [{ productCode: 'G45', quantity: 10 }],
      }),
    ]);

    await render(<ManifestHistoryScreen />);

    await waitFor(() => expect(screen.getByText('CAMION-01')).toBeTruthy());
    expect(screen.getByText('CAMION-09')).toBeTruthy();
    expect(screen.getByText('8 envases')).toBeTruthy();
    expect(screen.getByText('10 envases')).toBeTruthy();
  });

  it('shows the manifest date on each row', async () => {
    mockedApiGet.mockResolvedValue([buildManifest({ id: 'm1' })]);

    await render(<ManifestHistoryScreen />);

    await waitFor(() => expect(screen.getByTestId('manifest-history-row-m1')).toBeTruthy());
    expect(screen.getByTestId('manifest-history-row-m1')).toHaveTextContent(/\d{2}\/\d{2}/);
  });

  it('shows the note when the manifest has one', async () => {
    mockedApiGet.mockResolvedValue([buildManifest({ id: 'm1', note: 'Faltaron 2 G15' })]);

    await render(<ManifestHistoryScreen />);

    await waitFor(() => expect(screen.getByText('Faltaron 2 G15')).toBeTruthy());
  });

  it('shows a loading indicator while the fetch is in flight', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    mockedApiGet.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    await render(<ManifestHistoryScreen />);

    expect(screen.getByTestId('manifest-history-loading')).toBeTruthy();

    resolveFetch([]);
    await waitFor(() => expect(screen.queryByTestId('manifest-history-loading')).toBeNull());
  });
});

describe('ManifestHistoryScreen/empty', () => {
  it('shows an explicit empty state when the driver has no manifests yet', async () => {
    mockedApiGet.mockResolvedValue([]);

    await render(<ManifestHistoryScreen />);

    await waitFor(() => expect(screen.getByText('Todavía no cargaste ningún remito')).toBeTruthy());
  });
});

describe('ManifestHistoryScreen/error', () => {
  it('shows a visible error banner when the fetch fails, without crashing', async () => {
    mockedApiGet.mockRejectedValue(new Error('No se pudo conectar con el servidor.'));

    await render(<ManifestHistoryScreen />);

    await waitFor(() =>
      expect(screen.getByText('No se pudo conectar con el servidor.')).toBeTruthy(),
    );
    expect(screen.queryByText('Todavía no cargaste ningún remito')).toBeNull();
  });
});
