import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  CustomerCategoryRecord,
  PriceTable,
  ProductRecord,
} from '@distribuidor/shared';
import { loadCachedCatalog, saveCatalogToCache } from '../services/catalog';
import { useAuth } from './AuthContext';

export type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error';

export type CatalogContextValue = {
  /** Solo los activos, en el orden que definio el admin. */
  products: ProductRecord[];
  prices: PriceTable | null;
  /**
   * Solo las activas, en el orden que definio el admin. Viven en el catalogo y
   * no en su propio contexto porque el alta rapida de clientes pasa sin senal:
   * tienen que sobrevivir en la misma cache que los precios.
   */
  categories: CustomerCategoryRecord[];
  status: CatalogStatus;
  /** Los precios salieron del cache: pueden estar desactualizados. */
  stale: boolean;
  /** Cuando se trajo el cache que se esta usando, si se esta usando uno. */
  fetchedAt: string | null;
  /** Sin catalogo no hay precio honesto que mostrar, y no se puede vender. */
  canSell: boolean;
  error: string | null;
  reload(): Promise<void>;
};

const CatalogContext = createContext<CatalogContextValue | undefined>(undefined);

/**
 * Fuente unica del catalogo y los precios para toda la app del chofer.
 *
 * Existe para cerrar la unica diferencia que quedaba entre lo que el chofer ve
 * y lo que la API graba: antes la pantalla calculaba el total con una tabla
 * hardcodeada mientras el servidor usaba la base. Con precios editables eso
 * significaba cotizarle al cliente un numero y grabar otro.
 */
export function CatalogProvider({ children }: { children: ReactNode }) {
  const { api, token } = useAuth();

  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [prices, setPrices] = useState<PriceTable | null>(null);
  const [categories, setCategories] = useState<CustomerCategoryRecord[]>([]);
  const [status, setStatus] = useState<CatalogStatus>('idle');
  const [stale, setStale] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      // En paralelo, pero se guardan juntos: un catalogo a medias no sirve.
      const [fetchedProducts, fetchedPrices, fetchedCategories] = await Promise.all([
        api.get<ProductRecord[]>('/products'),
        api.get<PriceTable>('/prices/table'),
        api.get<CustomerCategoryRecord[]>('/customer-categories'),
      ]);

      const now = new Date().toISOString();
      setProducts(fetchedProducts);
      setPrices(fetchedPrices);
      setCategories(fetchedCategories);
      setStale(false);
      setFetchedAt(now);
      setStatus('ready');

      await saveCatalogToCache({
        products: fetchedProducts,
        prices: fetchedPrices,
        categories: fetchedCategories,
        fetchedAt: now,
      });
    } catch {
      // Sin red se sigue vendiendo con lo ultimo conocido, pero marcado como
      // tal. Lo que NO se hace es inventar precios.
      const cached = await loadCachedCatalog();

      if (cached) {
        setProducts(cached.products);
        setPrices(cached.prices);
        setCategories(cached.categories);
        setStale(true);
        setFetchedAt(cached.fetchedAt);
        setStatus('ready');
        setError(null);
        return;
      }

      setProducts([]);
      setPrices(null);
      setCategories([]);
      setStale(false);
      setFetchedAt(null);
      setStatus('error');
      setError('No se pudieron cargar los productos y precios.');
    }
  }, [api, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleProducts = useMemo(
    () =>
      products
        .filter((product) => product.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)),
    [products],
  );

  const visibleCategories = useMemo(
    () =>
      categories
        .filter((category) => category.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [categories],
  );

  const value = useMemo<CatalogContextValue>(
    () => ({
      products: visibleProducts,
      prices,
      categories: visibleCategories,
      status,
      stale,
      fetchedAt,
      canSell: prices !== null && visibleProducts.length > 0,
      error,
      reload: load,
    }),
    [visibleProducts, prices, visibleCategories, status, stale, fetchedAt, error, load],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogContextValue {
  const context = useContext(CatalogContext);
  if (!context) {
    throw new Error('useCatalog must be used within a CatalogProvider');
  }
  return context;
}
