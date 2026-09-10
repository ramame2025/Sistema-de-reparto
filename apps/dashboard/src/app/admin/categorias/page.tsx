"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import type {
  CustomerCategoryRecord,
  UpdateCustomerCategoryInput,
} from "@distribuidor/shared";
import { useApiClient } from "../../../context/AuthContext";
import { ApiError } from "../../../lib/api-client";

type NewCategoryForm = {
  code: string;
  name: string;
};

const EMPTY_FORM: NewCategoryForm = { code: "", name: "" };

export default function CategoriasPage() {
  const api = useApiClient();

  const [form, setForm] = useState<NewCategoryForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const {
    data: categories = [],
    isLoading,
    error: loadError,
    mutate: reloadCategories,
  } = useSWR<CustomerCategoryRecord[]>("/customer-categories?includeInactive=true");

  const error =
    actionError ?? (loadError ? "No se pudo cargar las categorias." : null);

  const orderedCategories = useMemo(
    () =>
      [...categories].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
    [categories],
  );

  // Una categoria nueva se agrega al final de la lista.
  const nextSortOrder = useMemo(
    () =>
      categories.reduce((max, category) => Math.max(max, category.sortOrder + 1), 0),
    [categories],
  );

  const createCategory = async () => {
    // A diferencia de zonas y productos, el codigo NO se pasa a mayusculas:
    // las tres categorias semilla ('final', 'comercio', 'distribuidor') vienen
    // del enum viejo, son inmutables y son minusculas. Forzar mayusculas en
    // las nuevas dejaria la columna partida en dos convenciones para siempre.
    const code = form.code.trim();

    try {
      setCreating(true);
      setActionError(null);
      setNotice(null);

      await api.post("/customer-categories", {
        code,
        name: form.name.trim(),
        sortOrder: nextSortOrder,
      });

      setForm(EMPTY_FORM);
      setNotice(
        `Categoria ${code} creada. Cargale los precios en Productos: hasta que los tenga, no se le puede vender.`,
      );
      await reloadCategories();
    } catch (err) {
      const duplicate = err instanceof ApiError && err.status === 409;
      setActionError(
        duplicate
          ? `Ya existe una categoria con el codigo ${code}. Una categoria dada de baja tampoco se puede reusar, porque las ventas viejas y los clientes que la tienen asignada la siguen referenciando.`
          : "No se pudo crear la categoria.",
      );
    } finally {
      setCreating(false);
    }
  };

  const setActive = async (category: CustomerCategoryRecord, isActive: boolean) => {
    // Dar de baja saca la categoria de la lista con la que se dan de alta los
    // clientes; reactivar no rompe nada, asi que solo se pregunta al ocultarla.
    if (
      !isActive &&
      !window.confirm(
        `Dar de baja ${category.name}? Deja de poder asignarse a clientes nuevos. Los clientes que ya la tienen, y las ventas viejas, no se tocan.`,
      )
    ) {
      return;
    }

    try {
      setActionError(null);
      setNotice(null);
      await api.patch(`/customer-categories/${category.id}`, { isActive });
      setNotice(`${category.name} ${isActive ? "reactivada" : "dada de baja"}.`);
      await reloadCategories();
    } catch {
      setActionError("No se pudo cambiar el estado de la categoria.");
    }
  };

  const canCreate = form.code.trim().length > 0 && form.name.trim().length >= 2;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold">Nueva categoria</h2>
        <p className="mt-2 text-sm text-slate-600">
          El codigo no se puede cambiar despues: viaja dentro de las ventas que
          los choferes tienen guardadas en el telefono. El nombre si se puede
          renombrar cuando quieras.
        </p>
        <p
          data-testid="categories-price-warning"
          className="mt-2 text-sm text-amber-700"
        >
          Una categoria nueva nace <strong>sin precios</strong>. No se copian
          los de otra categoria a proposito: un precio heredado miente en
          silencio, una celda vacia se ve. Cargalos en Productos, donde
          aparecen en rojo hasta que los completes.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-sm text-slate-600">
            Codigo
            <input
              type="text"
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
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
        </div>
        <button
          type="button"
          onClick={() => void createCategory()}
          disabled={creating || !canCreate}
          className="mt-4 h-10 rounded bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {creating ? "Creando..." : "Crear categoria"}
        </button>

        {error && (
          <p data-testid="categories-error" className="mt-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        {notice && (
          <p
            data-testid="categories-notice"
            className="mt-3 text-sm text-emerald-700"
          >
            {notice}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold">Categorias de cliente</h2>

        {isLoading && (
          <p className="mt-4 text-slate-600">Cargando categorias...</p>
        )}

        {!isLoading && orderedCategories.length === 0 && (
          <p data-testid="categories-empty" className="mt-4 text-slate-600">
            Todavia no hay categorias. Crea la primera arriba.
          </p>
        )}

        {!isLoading && orderedCategories.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4">Codigo</th>
                  <th className="py-2 pr-4">Nombre</th>
                  <th className="py-2 pr-4">Orden</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {orderedCategories.map((category) => (
                  <CategoryRow
                    key={category.id}
                    category={category}
                    api={api}
                    onSaved={async () => {
                      setActionError(null);
                      setNotice(`${category.name} actualizada.`);
                      await reloadCategories();
                    }}
                    onError={() =>
                      setActionError("No se pudo guardar la categoria.")
                    }
                    onToggleActive={() =>
                      void setActive(category, !category.isActive)
                    }
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

type CategoryRowProps = {
  category: CustomerCategoryRecord;
  api: ReturnType<typeof useApiClient>;
  onSaved: () => Promise<void>;
  onError: () => void;
  onToggleActive: () => void;
};

function CategoryRow({
  category,
  api,
  onSaved,
  onError,
  onToggleActive,
}: CategoryRowProps) {
  const [name, setName] = useState(category.name);
  const [sortOrder, setSortOrder] = useState(category.sortOrder);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const patch: UpdateCustomerCategoryInput = {};
    if (name.trim() !== category.name) {
      patch.name = name.trim();
    }
    if (sortOrder !== category.sortOrder) {
      patch.sortOrder = sortOrder;
    }

    // Guardar sin cambios no manda nada: el validador rechaza un patch vacio,
    // y seria un error que el admin no causo.
    if (Object.keys(patch).length === 0) {
      return;
    }

    try {
      setSaving(true);
      await api.patch(`/customer-categories/${category.id}`, patch);
      await onSaved();
    } catch {
      onError();
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="border-b border-slate-100">
      <td className="py-2 pr-4 font-medium">{category.code}</td>
      <td className="py-2 pr-4">
        <input
          type="text"
          data-testid={`name-${category.id}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded border border-slate-300 px-2 py-1"
        />
      </td>
      <td className="py-2 pr-4">
        <input
          type="number"
          data-testid={`sort-${category.id}`}
          value={sortOrder}
          onChange={(event) => setSortOrder(Number(event.target.value))}
          className="w-20 rounded border border-slate-300 px-2 py-1"
        />
      </td>
      <td className="py-2 pr-4">
        <span
          data-testid={`status-${category.id}`}
          className={
            category.isActive
              ? "rounded bg-emerald-100 px-2 py-1 text-emerald-800"
              : "rounded bg-slate-200 px-2 py-1 text-slate-600"
          }
        >
          {category.isActive ? "activa" : "de baja"}
        </span>
      </td>
      <td className="py-2 pr-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid={`save-${category.id}`}
            onClick={() => void save()}
            disabled={saving}
            className="rounded bg-sky-700 px-3 py-1 font-semibold text-white hover:bg-sky-800 disabled:bg-slate-400"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
          <button
            type="button"
            data-testid={`toggle-active-${category.id}`}
            onClick={onToggleActive}
            className="rounded bg-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-300"
          >
            {category.isActive ? "Dar de baja" : "Reactivar"}
          </button>
        </div>
      </td>
    </tr>
  );
}
