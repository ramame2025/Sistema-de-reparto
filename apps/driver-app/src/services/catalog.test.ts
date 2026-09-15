jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  CustomerCategoryRecord,
  PaymentMethodRecord,
  PriceTable,
  ProductRecord,
} from '@distribuidor/shared';
import {
  CATALOG_CACHE_KEY,
  loadCachedCatalog,
  saveCatalogToCache,
  type CachedCatalog,
} from './catalog';

const products: ProductRecord[] = [
  {
    id: 'p1',
    code: 'G10',
    name: 'Garrafa 10kg',
    isActive: true,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const categories: CustomerCategoryRecord[] = [
  {
    id: 'k1',
    code: 'final',
    name: 'Final',
    isActive: true,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const paymentMethods: PaymentMethodRecord[] = [
  {
    id: 'pm1',
    code: 'efectivo',
    name: 'Efectivo',
    isActive: true,
    sortOrder: 0,
    proofPolicy: 'none',
    countsAsCash: true,
    createsDebt: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const prices: PriceTable = {
  final: { G10: 8500 },
  comercio: { G10: 8200 },
  distribuidor: { G10: 7900 },
};

describe('catalog cache', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('round-trips products, prices, categories and payment methods through storage', async () => {
    await saveCatalogToCache({
      products,
      prices,
      categories,
      paymentMethods,
      fetchedAt: '2026-08-27T10:00:00.000Z',
    });

    const cached = await loadCachedCatalog();

    expect(cached?.products).toEqual(products);
    expect(cached?.prices).toEqual(prices);
    expect(cached?.categories).toEqual(categories);
    expect(cached?.paymentMethods).toEqual(paymentMethods);
    expect(cached?.fetchedAt).toBe('2026-08-27T10:00:00.000Z');
  });

  // El chofer da de alta clientes sin senal, y para eso necesita la lista de
  // categorias tanto como los precios: una cache vieja sin ella no sirve
  // entera, asi que se descarta igual que cualquier otra forma desconocida.
  it('returns null for a cache saved before categories existed', async () => {
    await AsyncStorage.setItem(
      CATALOG_CACHE_KEY,
      JSON.stringify({ products, prices, fetchedAt: '2026-08-26T10:00:00.000Z' }),
    );

    expect(await loadCachedCatalog()).toBeNull();
  });

  // Mismo criterio para los medios de pago: sin ellos la pantalla de venta no
  // sabe que ofrecer ni si pedir comprobante, asi que la cache no sirve a
  // medias.
  it('returns null for a cache saved before payment methods existed', async () => {
    await AsyncStorage.setItem(
      CATALOG_CACHE_KEY,
      JSON.stringify({
        products,
        prices,
        categories,
        fetchedAt: '2026-08-26T10:00:00.000Z',
      }),
    );

    expect(await loadCachedCatalog()).toBeNull();
  });

  // La clave lleva version: el bundle cambio de forma, y una entrada vieja
  // guardada bajo la clave anterior no se puede leer como si fuera esta.
  it('is stored under a versioned key', () => {
    expect(CATALOG_CACHE_KEY).toBe('driver_catalog_v4');
  });

  // `createsDebt` cambio la forma de `PaymentMethodRecord`. Una entrada v3
  // trae medios de pago sin la bandera, y leerla dejaria a la pantalla
  // creyendo que ningun medio genera deuda -- justo la decision que la
  // bandera existe para tomar. La entrada vieja se abandona, no se migra.
  it('ignores an entry left under the previous version of the key', async () => {
    await AsyncStorage.setItem(
      'driver_catalog_v3',
      JSON.stringify({
        products,
        prices,
        categories,
        paymentMethods,
        fetchedAt: '2026-09-13T10:00:00.000Z',
      }),
    );

    expect(await loadCachedCatalog()).toBeNull();
  });

  // Sin cache no hay precio honesto que mostrar. Devolver null deja que la
  // pantalla bloquee la venta en vez de inventar un numero.
  it('returns null when nothing was ever cached', async () => {
    expect(await loadCachedCatalog()).toBeNull();
  });

  it('returns null instead of throwing when the cache is corrupt', async () => {
    await AsyncStorage.setItem(CATALOG_CACHE_KEY, 'no-es-json');

    expect(await loadCachedCatalog()).toBeNull();
  });

  it('returns null when the cached shape is not a catalogue', async () => {
    await AsyncStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ hola: true }));

    expect(await loadCachedCatalog()).toBeNull();
  });

  it('overwrites the previous cache rather than appending', async () => {
    await saveCatalogToCache({
      products,
      prices,
      categories,
      paymentMethods,
      fetchedAt: '2026-08-26T10:00:00.000Z',
    });
    const newer: CachedCatalog = {
      products: [],
      prices: { final: {}, comercio: {}, distribuidor: {} },
      categories: [],
      paymentMethods: [],
      fetchedAt: '2026-08-27T10:00:00.000Z',
    };
    await saveCatalogToCache(newer);

    const cached = await loadCachedCatalog();

    expect(cached?.products).toEqual([]);
    expect(cached?.fetchedAt).toBe('2026-08-27T10:00:00.000Z');
  });
});
