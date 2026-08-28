jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('./AuthContext', () => {
  const actual = jest.requireActual('./AuthContext');
  return { ...actual, useAuth: jest.fn() };
});

import React from 'react';
import { Text } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PriceTable, ProductRecord } from '@distribuidor/shared';
import { CatalogProvider, useCatalog } from './CatalogContext';
import { useAuth } from './AuthContext';
import { CATALOG_CACHE_KEY } from '../services/catalog';

const mockedUseAuth = useAuth as jest.Mock;

const product = (code: string, sortOrder: number, isActive = true): ProductRecord => ({
  id: `p-${code}`,
  code,
  name: `Producto ${code}`,
  isActive,
  sortOrder,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const PRODUCTS = [product('G10', 0), product('G15', 1)];
const PRICES: PriceTable = {
  final: { G10: 8500, G15: 13000 },
  comercio: { G10: 8200, G15: 12600 },
  distribuidor: { G10: 7900, G15: 12100 },
};

function Probe() {
  const { products, prices, status, stale, canSell } = useCatalog();
  return (
    <>
      <Text testID="status">{status}</Text>
      <Text testID="stale">{String(stale)}</Text>
      <Text testID="can-sell">{String(canSell)}</Text>
      <Text testID="codes">{products.map((p) => p.code).join(',')}</Text>
      <Text testID="g10">{String(prices?.final.G10 ?? 'none')}</Text>
    </>
  );
}

const renderProbe = () =>
  render(
    <CatalogProvider>
      <Probe />
    </CatalogProvider>,
  );

describe('CatalogContext', () => {
  let get: jest.Mock;

  beforeEach(async () => {
    await AsyncStorage.clear();
    get = jest.fn();
    mockedUseAuth.mockReturnValue({ api: { get }, token: 'tok' });
  });

  const givenApiReturns = (products: ProductRecord[], prices: PriceTable) => {
    get.mockImplementation((path: string) =>
      Promise.resolve(path === '/products' ? products : prices),
    );
  };

  it('loads the catalogue from the API and allows selling', async () => {
    givenApiReturns(PRODUCTS, PRICES);

    renderProbe();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('codes')).toHaveTextContent('G10,G15');
    expect(screen.getByTestId('g10')).toHaveTextContent('8500');
    expect(screen.getByTestId('stale')).toHaveTextContent('false');
    expect(screen.getByTestId('can-sell')).toHaveTextContent('true');
  });

  it('caches what it fetched, so the next launch works offline', async () => {
    givenApiReturns(PRODUCTS, PRICES);

    renderProbe();

    await waitFor(async () =>
      expect(await AsyncStorage.getItem(CATALOG_CACHE_KEY)).not.toBeNull(),
    );
  });

  // Offline con cache: se vende igual, con los ultimos precios conocidos, pero
  // el chofer TIENE que ver que pueden estar desactualizados.
  it('falls back to the cache and marks it stale when the API is unreachable', async () => {
    await AsyncStorage.setItem(
      CATALOG_CACHE_KEY,
      JSON.stringify({
        products: PRODUCTS,
        prices: PRICES,
        fetchedAt: '2026-08-26T10:00:00.000Z',
      }),
    );
    get.mockRejectedValue(new Error('Network request failed'));

    renderProbe();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('stale')).toHaveTextContent('true');
    expect(screen.getByTestId('can-sell')).toHaveTextContent('true');
    expect(screen.getByTestId('g10')).toHaveTextContent('8500');
  });

  // Sin cache no hay ningun precio honesto que mostrar. Se bloquea la venta en
  // vez de inventar un numero: un precio equivocado mostrado con seguridad es
  // peor que una negativa.
  it('blocks selling when the API fails and nothing was ever cached', async () => {
    get.mockRejectedValue(new Error('Network request failed'));

    renderProbe();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
    expect(screen.getByTestId('can-sell')).toHaveTextContent('false');
    expect(screen.getByTestId('g10')).toHaveTextContent('none');
  });

  it('hides deactivated products from the driver', async () => {
    givenApiReturns([product('G10', 0), product('VIEJO', 1, false)], PRICES);

    renderProbe();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('codes')).toHaveTextContent('G10');
    expect(screen.getByTestId('codes')).not.toHaveTextContent('VIEJO');
  });

  it('orders products by sortOrder, so the admin controls the driver screen', async () => {
    givenApiReturns([product('G45', 2), product('G10', 0), product('G15', 1)], PRICES);

    renderProbe();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('codes')).toHaveTextContent('G10,G15,G45');
  });

  it('does nothing while there is no session', async () => {
    mockedUseAuth.mockReturnValue({ api: { get }, token: null });

    renderProbe();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('idle'));
    expect(get).not.toHaveBeenCalled();
  });
});
