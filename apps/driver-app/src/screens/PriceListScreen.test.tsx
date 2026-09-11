import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { CustomerCategoryRecord, ProductRecord } from '@distribuidor/shared';
import { PriceListScreen } from './PriceListScreen';
import { useCatalog } from '../context/CatalogContext';

jest.mock('../context/CatalogContext', () => ({ useCatalog: jest.fn() }));

const mockedUseCatalog = useCatalog as jest.MockedFunction<typeof useCatalog>;

const product = (code: string, name: string): ProductRecord => ({
  id: `product-${code}`,
  code,
  name,
  isActive: true,
  sortOrder: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const category = (code: string, name: string): CustomerCategoryRecord => ({
  id: `category-${code}`,
  code,
  name,
  isActive: true,
  sortOrder: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const catalogWith = (overrides: Partial<ReturnType<typeof useCatalog>> = {}) => {
  mockedUseCatalog.mockReturnValue({
    products: [product('G10', 'Garrafa 10kg')],
    prices: { final: { G10: 8500 } },
    categories: [category('final', 'Consumidor final')],
    status: 'ready',
    stale: false,
    fetchedAt: new Date(2026, 7, 28, 7, 5).toISOString(),
    canSell: true,
    error: null,
    reload: jest.fn(),
    ...overrides,
  } as ReturnType<typeof useCatalog>);
};

describe('PriceListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    catalogWith();
  });

  it('prices every product for every customer category', async () => {
    await render(<PriceListScreen />);

    expect(screen.getByTestId('price-list-row-G10')).toBeTruthy();
    expect(screen.getByText('Consumidor final')).toBeTruthy();
    expect(screen.getByText('$8.500')).toBeTruthy();
  });

  it('dates the list, because the driver quotes from it offline', async () => {
    await render(<PriceListScreen />);

    expect(screen.getByText('ACTUALIZADA 07:05')).toBeTruthy();
  });

  it('warns when the prices came off the phone instead of the server', async () => {
    catalogWith({ stale: true });

    await render(<PriceListScreen />);

    expect(screen.getByTestId('price-list-stale')).toBeTruthy();
  });

  it('says which product has no price for a category rather than leaving a blank', async () => {
    // Un agujero en la tabla significa que a esa categoria no se le puede
    // vender ese producto: mejor enterarse aca que al cerrar la venta.
    catalogWith({ prices: {} });

    await render(<PriceListScreen />);

    expect(screen.getByText('Sin precio')).toBeTruthy();
  });

  it('invites the admin to load prices when there is no catalog at all', async () => {
    catalogWith({ products: [], prices: null, categories: [], status: 'ready' });

    await render(<PriceListScreen />);

    expect(screen.getByText('Todavía no hay precios')).toBeTruthy();
  });

  it('shows a visible error instead of a silently empty list', async () => {
    catalogWith({ error: 'No se pudo traer el catálogo.' });

    await render(<PriceListScreen />);

    expect(screen.getByText('No se pudo traer el catálogo.')).toBeTruthy();
  });
});
