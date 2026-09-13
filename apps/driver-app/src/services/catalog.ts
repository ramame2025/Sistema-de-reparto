import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  CustomerCategoryRecord,
  PaymentMethodRecord,
  PriceTable,
  ProductRecord,
} from '@distribuidor/shared';

/**
 * La clave lleva version porque el bundle cambio de forma: la v2 agrego las
 * categorias de cliente y la v3 los medios de pago. Cambiarla -- en vez de
 * tolerar la forma vieja -- hace que una cache anterior se ignore entera en
 * lugar de leerse a medias.
 *
 * El costo de este bump es operativo y hay que tenerlo presente: un chofer que
 * actualiza la app a mitad de turno queda con una cache ilegible y no puede
 * vender hasta que el telefono agarre senal una vez. Por eso la app no se
 * publica a mitad de turno.
 */
export const CATALOG_CACHE_KEY = 'driver_catalog_v3';

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
 *
 * Los medios de pago viajan por el mismo motivo, y ademas traen las reglas:
 * `proofPolicy` decide si la venta lleva comprobante, y esa decision se toma
 * en la calle, sin senal.
 */
export type CachedCatalog = {
  products: ProductRecord[];
  prices: PriceTable;
  categories: CustomerCategoryRecord[];
  paymentMethods: PaymentMethodRecord[];
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
    Array.isArray(candidate.paymentMethods) &&
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
