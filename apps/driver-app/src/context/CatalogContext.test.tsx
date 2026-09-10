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
import type {
  CustomerCategoryRecord,
  PriceTable,
  ProductRecord,
} from '@distribuidor/shared';
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

const category = (
  code: string,
  sortOrder: number,
  isActive = true,
): CustomerCategoryRecord => ({
  id: `k-${code}`,
  code,
  name: code.charAt(0).toUpperCase() + code.slice(1),
  isActive,
  sortOrder,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const CATEGORIES = [category('final', 0), category('comercio', 1)];

const PRODUCTS = [product('G10', 0), product('G15', 1)];
const PRICES: PriceTable = {
  final: { G10: 8500, G15: 13000 },
  comercio: { G10: 8200, G15: 12600 },
  distribuidor: { G10: 7900, G15: 12100 },
};

function Probe() {
  const { products, prices, categories, status, stale, canSell } = useCatalog();
  return (
    <>
      <Text testID="status">{status}</Text>
      <Text testID="stale">{String(stale)}</Text>
      <Text testID="can-sell">{String(canSell)}</Text>
      <Text testID="codes">{products.map((p) => p.code).join(',')}</Text>
      <Text testID="g10">{String(prices?.final?.G10 ?? 'none')}</Text>
      <Text testID="categories">{categories.map((c) => c.code).join(',')}</Text>
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

  const givenApiReturns = (
    products: ProductRecord[],
    prices: PriceTable,
    categories: CustomerCategoryRecord[] = CATEGORIES,
  ) => {
    get.mockImplementation((path: string) => {
      if (path === '/products') return Promise.resolve(products);
      if (path === '/customer-categories') return Promise.resolve(categories);
      return Promise.resolve(prices);
    });
  };

  it('loads the catalogue from the API and allows selling', async () => {
    givenApiReturns(PRODUCTS, PRICES);

    renderProbe();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('codes')).toHaveTextContent('G10,G15');
    expect(screen.getByTestId('g10')).toHaveTextContent('8500');
    expect(screen.getByTestId('stale')).toHaveTextContent('false');
    expect(screen.getByTestId('can-sell')).toHaveTextContent('true');
    expect(screen.getByTestId('categories')).toHaveTextContent('final,comercio');
  });

  // El chofer da de alta clientes sin senal, asi que la lista de categorias
  // viaja en el MISMO bundle cacheado que productos y precios: un catalogo a
  // medias no sirve.
  it('caches the categories alongside the products and prices', async () => {
    givenApiReturns(PRODUCTS, PRICES);

    renderProbe();

    await waitFor(async () => {
      const raw = await AsyncStorage.getItem(CATALOG_CACHE_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw as string).categories).toHaveLength(2);
    });
  });

  it('hides deactivated categories from the driver, ordered by sortOrder', async () => {
    givenApiReturns(PRODUCTS, PRICES, [
      category('mayorista', 2),
      category('final', 0),
      category('retirada', 1, false),
    ]);

    renderProbe();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('categories')).toHaveTextContent('final,mayorista');
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
        categories: CATEGORIES,
        fetchedAt: '2026-08-26T10:00:00.000Z',
      }),
    );
    get.mockRejectedValue(new Error('Network request failed'));

    renderProbe();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('stale')).toHaveTextContent('true');
    expect(screen.getByTestId('can-sell')).toHaveTextContent('true');
    expect(screen.getByTestId('g10')).toHaveTextContent('8500');
    expect(screen.getByTestId('categories')).toHaveTextContent('final,comercio');
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
