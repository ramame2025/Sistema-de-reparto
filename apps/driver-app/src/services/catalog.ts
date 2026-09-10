import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  CustomerCategoryRecord,
  PriceTable,
  ProductRecord,
} from '@distribuidor/shared';

/**
 * La clave lleva version porque el bundle cambio de forma: la v2 agrega las
 * categorias de cliente. Cambiarla -- en vez de tolerar la forma vieja -- hace
 * que una cache anterior se ignore entera en lugar de leerse a medias.
 */
export const CATALOG_CACHE_KEY = 'driver_catalog_v2';

/**
 * El catalogo y los precios tal como los devolvio la API la ultima vez, mas
 * cuando fue esa vez.
 *
 * Se cachea junto, en una sola entrada: productos, precios y categorias tienen
 * que ser coherentes entre si. Un producto sin su precio no se puede vender, y
 * un precio de un producto que ya no esta en la lista no le sirve a nadie.
 *
 * Las categorias viajan en el mismo bundle porque el chofer da de alta
 * clientes SIN SENAL: sin la lista guardada, el alta rapida se quedaria sin
 * tipos que ofrecer justo cuando mas falta hace.
 */
export type CachedCatalog = {
  products: ProductRecord[];
  prices: PriceTable;
  categories: CustomerCategoryRecord[];
  fetchedAt: string;
};

function isCatalog(value: unknown): value is CachedCatalog {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<CachedCatalog>;
  return (
    Array.isArray(candidate.products) &&
    Array.isArray(candidate.categories) &&
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
