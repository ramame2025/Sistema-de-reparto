"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  CUSTOMER_TYPES,
  type CustomerType,
  type PriceTable,
  type ProductRecord,
} from "@distribuidor/shared";
import { useApiClient } from "../../../context/AuthContext";
import { ApiError } from "../../../lib/api-client";

type NewProductForm = {
  code: string;
  name: string;
  prices: Record<CustomerType, string>;
};

const EMPTY_FORM: NewProductForm = {
  code: "",
  name: "",
  prices: { final: "", comercio: "", distribuidor: "" },
};

const PRICE_LABEL: Record<CustomerType, string> = {
  final: "Precio final",
  comercio: "Precio comercio",
  distribuidor: "Precio distribuidor",
};

/**
 * El chofer se trae los precios al abrir la app o al sincronizar, no al
 * instante. Decirlo evita el reclamo de "cambie el precio y el chofer cobro el
 * viejo", que no es un bug sino el funcionamiento offline.
 */
const SYNC_NOTICE =
  "Los choferes van a ver el precio nuevo la proxima vez que sincronicen o abran la app.";

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

  const error = actionError ?? (loadError ? "No se pudo cargar productos." : null);

  const orderedProducts = useMemo(
    () =>
      [...products].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
      ),
    [products],
  );

  // Un producto nuevo se agrega al final de la lista que ve el chofer.
  const nextSortOrder = useMemo(
    () =>
      products.reduce((max, product) => Math.max(max, product.sortOrder + 1), 0),
    [products],
  );

  const refresh = async () => {
    await Promise.all([reloadProducts(), reloadPrices()]);
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
        prices: {
          final: Number(form.prices.final),
          comercio: Number(form.prices.comercio),
          distribuidor: Number(form.prices.distribuidor),
        },
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

  const canCreate =
    form.code.trim().length > 0 &&
    form.name.trim().length >= 2 &&
    CUSTOMER_TYPES.every((type) => form.prices[type].trim().length > 0);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold">Nuevo producto</h2>
        <p className="mt-2 text-sm text-slate-600">
          El codigo no se puede cambiar despues: viaja dentro de las ventas que
          los choferes tienen guardadas en el telefono. Los tres precios son
          obligatorios.
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
          {CUSTOMER_TYPES.map((type) => (
            <label key={type} className="text-sm text-slate-600">
              {PRICE_LABEL[type]}
              <input
                type="number"
                min={0}
                value={form.prices[type]}
                onChange={(event) =>
                  setForm({
                    ...form,
                    prices: { ...form.prices, [type]: event.target.value },
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
                  <th className="py-2 pr-4">Final</th>
                  <th className="py-2 pr-4">Comercio</th>
                  <th className="py-2 pr-4">Distribuidor</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {orderedProducts.map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
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
  priceTable?: PriceTable;
  api: ReturnType<typeof useApiClient>;
  onSaved: (changedPrices: boolean) => Promise<void>;
  onError: () => void;
  onToggleActive: () => void;
};

function ProductRow({
  product,
  priceTable,
  api,
  onSaved,
  onError,
  onToggleActive,
}: ProductRowProps) {
  const storedPrices = useMemo(
    () =>
      Object.fromEntries(
        CUSTOMER_TYPES.map((type) => [type, priceTable?.[type]?.[product.code] ?? 0]),
      ) as Record<CustomerType, number>,
    [priceTable, product.code],
  );

  const [name, setName] = useState(product.name);
  const [prices, setPrices] = useState<Record<CustomerType, number>>(storedPrices);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const renamed = name.trim() !== product.name;
    const changedTypes = CUSTOMER_TYPES.filter(
      (type) => prices[type] !== storedPrices[type],
    );

    // Guardar sin cambios no manda nada: el validador rechaza un patch vacio,
    // y seria un error que el admin no causo.
    if (!renamed && changedTypes.length === 0) {
      return;
    }

    try {
      setSaving(true);
      if (renamed) {
        await api.patch(`/products/${product.id}`, { name: name.trim() });
      }
      // Cada precio es su propia version nueva; no se pisa ninguna anterior.
      for (const type of changedTypes) {
        await api.put(`/prices/${product.code}/${type}`, { amount: prices[type] });
      }
      await onSaved(changedTypes.length > 0);
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
      {CUSTOMER_TYPES.map((type) => (
        <td key={type} className="py-2 pr-4">
          <input
            type="number"
            min={0}
            data-testid={`price-${product.code}-${type}`}
            value={prices[type]}
            onChange={(event) =>
              setPrices({ ...prices, [type]: Number(event.target.value) })
            }
            className="w-28 rounded border border-slate-300 px-2 py-1"
          />
        </td>
      ))}
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
