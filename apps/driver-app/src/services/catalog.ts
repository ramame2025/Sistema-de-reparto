import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PriceTable, ProductRecord } from '@distribuidor/shared';

export const CATALOG_CACHE_KEY = 'driver_catalog_v1';

/**
 * El catalogo y los precios tal como los devolvio la API la ultima vez, mas
 * cuando fue esa vez.
 *
 * Se cachea junto, en una sola entrada: productos y precios tienen que ser
 * coherentes entre si. Un producto sin su precio no se puede vender, y un
 * precio de un producto que ya no esta en la lista no le sirve a nadie.
 */
export type CachedCatalog = {
  products: ProductRecord[];
  prices: PriceTable;
  fetchedAt: string;
};

function isCatalog(value: unknown): value is CachedCatalog {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<CachedCatalog>;
  return (
    Array.isArray(candidate.products) &&
    typeof candidate.prices === 'object' &&
    candidate.prices !== null &&
    typeof candidate.fetchedAt === 'string'
  );
}

/**
 * Devuelve `null` -- nunca datos a medias ni una excepcion -- ante cualquier
 * cache ausente, corrupta o de otra forma. Sin catalogo la pantalla bloquea la
 * venta, que es la respuesta honesta: un precio inventado mostrado con
 * seguridad es peor que no mostrar ninguno.
 */
export const loadCachedCatalog = async (): Promise<CachedCatalog | null> => {
  try {
    const raw = await AsyncStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    return isCatalog(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const saveCatalogToCache = async (catalog: CachedCatalog): Promise<void> => {
  await AsyncStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(catalog));
};
