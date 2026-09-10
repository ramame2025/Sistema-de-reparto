"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  type CustomerCategoryRecord,
  type PriceTable,
  type ProductRecord,
} from "@distribuidor/shared";
import { useApiClient } from "../../../context/AuthContext";
import { ApiError } from "../../../lib/api-client";

type NewProductForm = {
  code: string;
  name: string;
  /** Una entrada por categoria activa; cadena vacia significa "sin cargar". */
  prices: Record<string, string>;
};

const EMPTY_FORM: NewProductForm = { code: "", name: "", prices: {} };

/**
 * El chofer se trae los precios al abrir la app o al sincronizar, no al
 * instante. Decirlo evita el reclamo de "cambie el precio y el chofer cobro el
 * viejo", que no es un bug sino el funcionamiento offline.
 */
const SYNC_NOTICE =
  "Los choferes van a ver el precio nuevo la proxima vez que sincronicen o abran la app.";

/**
 * El precio guardado de una celda, o cadena vacia si NO HAY precio.
 *
 * Nunca `0`: cero es un precio real que el admin puede fijar, y usarlo tambien
 * como disfraz de "no hay precio" es exactamente lo que hacia que un agujero
 * pareciera una decision. Una celda vacia grita; un cero miente en silencio.
 */
function storedPriceOf(
  priceTable: PriceTable | undefined,
  categoryCode: string,
  productCode: string,
): string {
  const amount = priceTable?.[categoryCode]?.[productCode];
  return amount === undefined ? "" : String(amount);
}

export default function ProductosPage() {
  const api = useApiClient();

  const [form, setForm] = useState<NewProductForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const {
    data: products = [],
    isLoading,
    error: loadError,
    mutate: reloadProducts,
  } = useSWR<ProductRecord[]>("/products?includeInactive=true");

  const { data: priceTable, mutate: reloadPrices } =
    useSWR<PriceTable>("/prices/table");

  // Solo las categorias vigentes: una dada de baja no se le puede vender a
  // nadie, asi que pedirle precio seria pedir un dato muerto.
  const { data: categories = [], mutate: reloadCategories } =
    useSWR<CustomerCategoryRecord[]>("/customer-categories");

  const error = actionError ?? (loadError ? "No se pudo cargar productos." : null);

  const orderedProducts = useMemo(
    () =>
      [...products].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
      ),
    [products],
  );

  const orderedCategories = useMemo(
    () =>
      [...categories].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
    [categories],
  );

  // Cuantos productos le faltan a cada categoria. Es lo que deja ver de un
  // vistazo cual esta inutilizable: a una categoria sin precios no se le puede
  // vender nada, y el chofer se entera recien frente al cliente.
  const missingByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const category of orderedCategories) {
      const missing = orderedProducts.filter(
        (product) => priceTable?.[category.code]?.[product.code] === undefined,
      ).length;
      counts.set(category.code, missing);
    }
    return counts;
  }, [orderedCategories, orderedProducts, priceTable]);

  // Un producto nuevo se agrega al final de la lista que ve el chofer.
  const nextSortOrder = useMemo(
    () =>
      products.reduce((max, product) => Math.max(max, product.sortOrder + 1), 0),
    [products],
  );

  const refresh = async () => {
    await Promise.all([reloadProducts(), reloadPrices(), reloadCategories()]);
  };

  const createProduct = async () => {
    const code = form.code.trim().toUpperCase();

    try {
      setCreating(true);
      setActionError(null);
      setNotice(null);

      await api.post("/products", {
        code,
        name: form.name.trim(),
        sortOrder: nextSortOrder,
        prices: Object.fromEntries(
          orderedCategories.map((category) => [
            category.code,
            Number(form.prices[category.code]),
          ]),
        ),
      });

      setForm(EMPTY_FORM);
      setNotice(`Producto ${code} creado.`);
      await refresh();
    } catch (err) {
      const duplicate = err instanceof ApiError && err.status === 409;
      setActionError(
        duplicate
          ? `Ya existe un producto con el codigo ${code}. Un codigo dado de baja tampoco se puede reusar, porque sus ventas viejas lo referencian.`
          : "No se pudo crear el producto.",
      );
    } finally {
      setCreating(false);
    }
  };

  const setActive = async (product: ProductRecord, isActive: boolean) => {
    // Dar de baja saca el producto de la pantalla del chofer; reactivar no
    // rompe nada, asi que solo se pregunta al ocultarlo.
    if (
      !isActive &&
      !window.confirm(
        `Dar de baja ${product.name}? Deja de aparecer en la app del chofer. Las ventas viejas no se tocan.`,
      )
    ) {
      return;
    }

    try {
      setActionError(null);
      setNotice(null);
      await api.patch(`/products/${product.id}`, { isActive });
      setNotice(`${product.name} ${isActive ? "reactivado" : "dado de baja"}.`);
      await refresh();
    } catch {
      setActionError("No se pudo cambiar el estado del producto.");
    }
  };

  // Nace completo o no nace: un producto sin precio para alguna categoria
  // activa no se le puede vender a esa categoria, y el chofer se entera recien
  // frente al cliente. Las categorias son las de AHORA, no una lista fija.
  const canCreate =
    form.code.trim().length > 0 &&
    form.name.trim().length >= 2 &&
    orderedCategories.length > 0 &&
    orderedCategories.every(
      (category) => (form.prices[category.code] ?? "").trim().length > 0,
    );

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold">Nuevo producto</h2>
        <p className="mt-2 text-sm text-slate-600">
          El codigo no se puede cambiar despues: viaja dentro de las ventas que
          los choferes tienen guardadas en el telefono. Hace falta un precio por
          cada categoria activa.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-5">
          <label className="text-sm text-slate-600">
            Codigo
            <input
              type="text"
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 uppercase"
            />
          </label>
          <label className="text-sm text-slate-600">
            Nombre
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          {orderedCategories.map((category) => (
            <label key={category.code} className="text-sm text-slate-600">
              {`Precio ${category.name}`}
              <input
                type="number"
                min={0}
                value={form.prices[category.code] ?? ""}
                onChange={(event) =>
                  setForm({
                    ...form,
                    prices: { ...form.prices, [category.code]: event.target.value },
                  })
                }
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void createProduct()}
          disabled={creating || !canCreate}
          className="mt-4 h-10 rounded bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {creating ? "Creando..." : "Crear producto"}
        </button>

        {error && (
          <p data-testid="products-error" className="mt-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        {notice && (
          <p data-testid="products-notice" className="mt-3 text-sm text-emerald-700">
            {notice}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold">Productos y precios</h2>

        {orderedCategories.length > 0 && orderedProducts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {orderedCategories.map((category) => {
              const missing = missingByCategory.get(category.code) ?? 0;
              return (
                <span
                  key={category.code}
                  data-testid={`completeness-${category.code}`}
                  className={
                    missing > 0
                      ? "rounded bg-rose-100 px-2 py-1 font-semibold text-rose-800"
                      : "rounded bg-emerald-100 px-2 py-1 text-emerald-800"
                  }
                >
                  {missing > 0
                    ? `${category.name}: ${missing} sin precio`
                    : `${category.name}: completa`}
                </span>
              );
            })}
          </div>
        )}

        {isLoading && <p className="mt-4 text-slate-600">Cargando productos...</p>}

        {!isLoading && orderedProducts.length === 0 && (
          <p data-testid="products-empty" className="mt-4 text-slate-600">
            Todavia no hay productos. Crea el primero arriba.
          </p>
        )}

        {!isLoading && orderedProducts.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4">Codigo</th>
                  <th className="py-2 pr-4">Nombre</th>
                  {orderedCategories.map((category) => (
                    <th key={category.code} className="py-2 pr-4">
                      {category.name}
                    </th>
                  ))}
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {orderedProducts.map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    categories={orderedCategories}
                    priceTable={priceTable}
                    api={api}
                    onSaved={async (changedPrices) => {
                      setActionError(null);
                      setNotice(
                        changedPrices
                          ? `${product.name} actualizado. ${SYNC_NOTICE}`
                          : `${product.name} actualizado.`,
                      );
                      await refresh();
                    }}
                    onError={() => setActionError("No se pudo guardar el producto.")}
                    onToggleActive={() => void setActive(product, !product.isActive)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

type ProductRowProps = {
  product: ProductRecord;
  categories: CustomerCategoryRecord[];
  priceTable?: PriceTable;
  api: ReturnType<typeof useApiClient>;
  onSaved: (changedPrices: boolean) => Promise<void>;
  onError: () => void;
  onToggleActive: () => void;
};

function ProductRow({
  product,
  categories,
  priceTable,
  api,
  onSaved,
  onError,
  onToggleActive,
}: ProductRowProps) {
  // Los precios se guardan como texto, no como numero, porque "sin precio"
  // tiene que ser representable y `0` ya significa "vale cero".
  const storedPrices = useMemo(
    () =>
      Object.fromEntries(
        categories.map((category) => [
          category.code,
          storedPriceOf(priceTable, category.code, product.code),
        ]),
      ) as Record<string, string>,
    [categories, priceTable, product.code],
  );

  const [name, setName] = useState(product.name);
  const [prices, setPrices] = useState<Record<string, string>>(storedPrices);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const renamed = name.trim() !== product.name;
    // Una celda que sigue vacia no manda nada: `ProductPrice` es append-only y
    // no hay forma de borrar un precio, asi que mandar 0 seria fijar un precio
    // real de cero en vez de dejar el agujero como esta.
    const changedCategories = categories
      .map((category) => category.code)
      .filter(
        (code) =>
          (prices[code] ?? "").trim().length > 0 &&
          prices[code] !== storedPrices[code],
      );

    // Guardar sin cambios no manda nada: el validador rechaza un patch vacio,
    // y seria un error que el admin no causo.
    if (!renamed && changedCategories.length === 0) {
      return;
    }

    try {
      setSaving(true);
      if (renamed) {
        await api.patch(`/products/${product.id}`, { name: name.trim() });
      }
      // Cada precio es su propia version nueva; no se pisa ninguna anterior.
      for (const code of changedCategories) {
        await api.put(`/prices/${product.code}/${code}`, {
          amount: Number(prices[code]),
        });
      }
      await onSaved(changedCategories.length > 0);
    } catch {
      onError();
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="border-b border-slate-100">
      <td className="py-2 pr-4 font-medium">{product.code}</td>
      <td className="py-2 pr-4">
        <input
          type="text"
          data-testid={`name-${product.id}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded border border-slate-300 px-2 py-1"
        />
      </td>
      {categories.map((category) => {
        const missing = storedPrices[category.code] === "";
        return (
          <td key={category.code} className="py-2 pr-4">
            <input
              type="number"
              min={0}
              data-testid={`price-${product.code}-${category.code}`}
              value={prices[category.code] ?? ""}
              placeholder={missing ? "sin precio" : undefined}
              onChange={(event) =>
                setPrices({ ...prices, [category.code]: event.target.value })
              }
              className={`w-28 rounded border px-2 py-1 ${
                missing
                  ? "border-rose-500 bg-rose-50 placeholder:text-rose-700"
                  : "border-slate-300"
              }`}
            />
            {missing && (
              <span
                data-testid={`price-missing-${product.code}-${category.code}`}
                className="mt-1 block text-xs font-semibold text-rose-700"
              >
                sin precio
              </span>
            )}
          </td>
        );
      })}
      <td className="py-2 pr-4">
        <span
          data-testid={`status-${product.id}`}
          className={
            product.isActive
              ? "rounded bg-emerald-100 px-2 py-1 text-emerald-800"
              : "rounded bg-slate-200 px-2 py-1 text-slate-600"
          }
        >
          {product.isActive ? "activo" : "de baja"}
        </span>
      </td>
      <td className="py-2 pr-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid={`save-${product.id}`}
            onClick={() => void save()}
            disabled={saving}
            className="rounded bg-sky-700 px-3 py-1 font-semibold text-white hover:bg-sky-800 disabled:bg-slate-400"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
          <button
            type="button"
            data-testid={`toggle-active-${product.id}`}
            onClick={onToggleActive}
            className="rounded bg-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-300"
          >
            {product.isActive ? "Dar de baja" : "Reactivar"}
          </button>
        </div>
      </td>
    </tr>
  );
}
