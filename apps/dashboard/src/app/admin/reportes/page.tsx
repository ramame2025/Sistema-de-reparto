"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { useApiClient, useAuth } from "../../../context/AuthContext";
import { Pager } from "../../../components/Pager";
import { resolveReceiptUrl } from "../../../lib/api-client";
import { downloadCsvReport } from "../../../lib/csv";
import { isoDateDaysAgo, todayIsoDate } from "../../../lib/dates";
import { formatPaymentMethod } from "../../../lib/format";
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  type ExpenseCategory,
  type ExpenseRecord,
  type PaymentMethod,
  type ProductCode,
  type ProductRecord,
  type SaleAuditRecord,
  type SaleRecord,
} from "@distribuidor/shared";

type SaleStatusFilter = "all" | "active" | "canceled";
type PaymentFilter = "all" | PaymentMethod;
type ProductFilter = "all" | ProductCode;
type ExpenseCategoryFilter = "all" | ExpenseCategory;

type Tab = "ingresos" | "gastos";

/**
 * Cuantas filas se muestran por pagina. El filtrado sigue siendo en memoria
 * sobre todo el dataset; esto es solo presentacion para no renderizar una
 * tabla infinita (y el CSV sigue exportando el set filtrado completo, no la
 * pagina visible).
 */
const PAGE_SIZE = 15;

export default function ReportesPage() {
  const { token: authToken } = useAuth();

  // La solapa vive en la URL para que un reporte se pueda compartir por link
  // y para no sincronizar estado que ya esta en la direccion.
  const searchParams = useSearchParams();
  const tab: Tab = searchParams.get("tab") === "gastos" ? "gastos" : "ingresos";
  const api = useApiClient();

  // Los datos del servidor los pide SWR (fetcher configurado en el layout);
  // en useState queda solo lo que es realmente estado local de la pantalla.
  const {
    data: sales = [],
    isLoading: salesLoading,
    error: salesLoadError,
    mutate: reloadSales,
  } = useSWR<SaleRecord[]>("/sales");

  // Incluye los dados de baja: sus ventas viejas siguen existiendo, y son
  // justamente las que alguien puede querer filtrar.
  const { data: filterProducts = [] } = useSWR<ProductRecord[]>(
    "/products?includeInactive=true",
  );
  const {
    data: expenses = [],
    isLoading: expensesLoading,
    error: expensesLoadError,
  } = useSWR<ExpenseRecord[]>("/expenses");
  // Por defecto, la ultima semana: el cierre habitual mira lo reciente, no
  // todo el historico. Editable como cualquier filtro.
  const [saleDateFrom, setSaleDateFrom] = useState(() => isoDateDaysAgo(7));
  const [saleDateTo, setSaleDateTo] = useState(() => todayIsoDate());
  const [saleStatusFilter, setSaleStatusFilter] = useState<SaleStatusFilter>("all");
  const [salePaymentFilter, setSalePaymentFilter] = useState<PaymentFilter>("all");
  const [saleProductFilter, setSaleProductFilter] = useState<ProductFilter>("all");
  const [saleDriverFilter, setSaleDriverFilter] = useState("");
  const [saleTruckFilter, setSaleTruckFilter] = useState("");
  const [saleSearch, setSaleSearch] = useState("");
  const [expenseDateFrom, setExpenseDateFrom] = useState(() => isoDateDaysAgo(7));
  const [expenseDateTo, setExpenseDateTo] = useState(() => todayIsoDate());
  const [expenseCategoryFilter, setExpenseCategoryFilter] =
    useState<ExpenseCategoryFilter>("all");
  const [selectedSaleForAudit, setSelectedSaleForAudit] = useState<SaleRecord | null>(null);
  const [saleActionError, setSaleActionError] = useState<string | null>(null);
  const [salesPage, setSalesPage] = useState(1);
  const [expensesPage, setExpensesPage] = useState(1);

  // La auditoria se pide sola al elegir una venta: con la clave en null,
  // SWR simplemente no dispara la request.
  const { data: audits = [], isLoading: auditLoading } = useSWR<SaleAuditRecord[]>(
    selectedSaleForAudit ? `/sales/${selectedSaleForAudit.id}/audits` : null,
  );

  // El comprobante de pago que sube el chofer al cobrar (transferencia/QR)
  // viaja en `paymentProofRef`, igual que `receiptRef` en los gastos. Se
  // resuelve aca para que el modal lo muestre: hasta ahora el dato llegaba
  // del backend pero no se renderizaba en ningun lado.
  const selectedSaleProofUrl = selectedSaleForAudit
    ? resolveReceiptUrl(selectedSaleForAudit.paymentProofRef)
    : null;

  const loading = salesLoading || expensesLoading;
  const error =
    saleActionError ??
    (salesLoadError || expensesLoadError ? "No se pudo cargar la lista de ventas." : null);

  const cancelSale = async (sale: SaleRecord) => {
    const reason = window.prompt("Motivo de anulacion", "Error de carga");
    if (!reason) {
      return;
    }

    try {
      setSaleActionError(null);
      await api.patch(`/sales/${sale.id}/cancel`, { reason });
      await reloadSales();
    } catch {
      setSaleActionError("No se pudo anular la venta.");
    }
  };

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const createdAtDate = new Date(sale.createdAt);

      if (saleDateFrom) {
        const from = new Date(`${saleDateFrom}T00:00:00`);
        if (createdAtDate < from) {
          return false;
        }
      }

      if (saleDateTo) {
        const to = new Date(`${saleDateTo}T23:59:59.999`);
        if (createdAtDate > to) {
          return false;
        }
      }

      if (saleStatusFilter !== "all" && sale.status !== saleStatusFilter) {
        return false;
      }

      if (salePaymentFilter !== "all" && sale.paymentMethod !== salePaymentFilter) {
        return false;
      }

      if (
        saleProductFilter !== "all" &&
        !sale.items.some((item) => item.productCode === saleProductFilter)
      ) {
        return false;
      }

      if (saleSearch.trim().length > 0) {
        const needle = saleSearch.toLowerCase();
        const haystack = `${sale.customerName} ${sale.customerType}`.toLowerCase();
        if (!haystack.includes(needle)) {
          return false;
        }
      }

      if (saleDriverFilter.trim().length > 0) {
        const needle = saleDriverFilter.toLowerCase();
        if (!sale.driverName.toLowerCase().includes(needle)) {
          return false;
        }
      }

      if (saleTruckFilter.trim().length > 0) {
        const needle = saleTruckFilter.toLowerCase();
        const truck = sale.truckCode?.toLowerCase() ?? "";
        if (!truck.includes(needle)) {
          return false;
        }
      }

      return true;
    });
  }, [
    sales,
    saleDateFrom,
    saleDateTo,
    saleStatusFilter,
    salePaymentFilter,
    saleProductFilter,
    saleDriverFilter,
    saleTruckFilter,
    saleSearch,
  ]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      const createdAtDate = new Date(expense.createdAt);

      if (expenseDateFrom) {
        const from = new Date(`${expenseDateFrom}T00:00:00`);
        if (createdAtDate < from) {
          return false;
        }
      }

      if (expenseDateTo) {
        const to = new Date(`${expenseDateTo}T23:59:59.999`);
        if (createdAtDate > to) {
          return false;
        }
      }

      if (expenseCategoryFilter !== "all" && expense.category !== expenseCategoryFilter) {
        return false;
      }

      return true;
    });
  }, [expenses, expenseDateFrom, expenseDateTo, expenseCategoryFilter]);

  // Cualquier cambio de filtro vuelve a la pagina 1: quedarse en la pagina 7
  // de un resultado que ahora tiene 2 paginas mostraria vacio. Se hace
  // ajustando estado durante el render (no con useEffect) para no disparar
  // un render en cascada -- patron "you might not need an effect" de React.
  const saleFilterKey = [
    saleDateFrom,
    saleDateTo,
    saleStatusFilter,
    salePaymentFilter,
    saleProductFilter,
    saleDriverFilter,
    saleTruckFilter,
    saleSearch,
  ].join("|");
  const [lastSaleFilterKey, setLastSaleFilterKey] = useState(saleFilterKey);
  if (saleFilterKey !== lastSaleFilterKey) {
    setLastSaleFilterKey(saleFilterKey);
    setSalesPage(1);
  }

  const expenseFilterKey = [
    expenseDateFrom,
    expenseDateTo,
    expenseCategoryFilter,
  ].join("|");
  const [lastExpenseFilterKey, setLastExpenseFilterKey] = useState(expenseFilterKey);
  if (expenseFilterKey !== lastExpenseFilterKey) {
    setLastExpenseFilterKey(expenseFilterKey);
    setExpensesPage(1);
  }

  const salesTotalPages = Math.max(1, Math.ceil(filteredSales.length / PAGE_SIZE));
  const expensesTotalPages = Math.max(
    1,
    Math.ceil(filteredExpenses.length / PAGE_SIZE),
  );

  // Clamp: si el dataset se achico entre renders, no dejar `salesPage`
  // apuntando fuera de rango (el useEffect ya cubre el caso "cambio un
  // filtro", esto cubre "los datos de SWR se revalidaron y trajeron menos").
  const currentSalesPage = Math.min(salesPage, salesTotalPages);
  const currentExpensesPage = Math.min(expensesPage, expensesTotalPages);

  const pagedSales = useMemo(
    () =>
      filteredSales.slice(
        (currentSalesPage - 1) * PAGE_SIZE,
        currentSalesPage * PAGE_SIZE,
      ),
    [filteredSales, currentSalesPage],
  );
  const pagedExpenses = useMemo(
    () =>
      filteredExpenses.slice(
        (currentExpensesPage - 1) * PAGE_SIZE,
        currentExpensesPage * PAGE_SIZE,
      ),
    [filteredExpenses, currentExpensesPage],
  );

  const totalFacturadoFiltrado = useMemo(
    () => filteredSales.reduce((acc, sale) => acc + sale.total, 0),
    [filteredSales],
  );

  const totalGastosFiltrados = useMemo(
    () => filteredExpenses.reduce((acc, expense) => acc + expense.amount, 0),
    [filteredExpenses],
  );

  const exportSalesCsv = () => {
    if (filteredSales.length === 0) {
      return;
    }

    downloadCsvReport({
      prefix: "cierre_ventas",
      from: saleDateFrom,
      to: saleDateTo,
      headers: [
        "fecha",
        "id",
        "chofer",
        "camion",
        "cliente",
        "tipo_cliente",
        "medio_pago",
        "estado",
        "total",
        "motivo_anulacion",
        "items",
      ],
      rows: filteredSales.map((sale) => [
        new Date(sale.createdAt).toISOString(),
        sale.id,
        sale.driverName,
        sale.truckCode ?? "",
        sale.customerName,
        sale.customerType,
        formatPaymentMethod(sale.paymentMethod),
        sale.status,
        sale.total,
        sale.cancelReason ?? "",
        sale.items.map((item) => `${item.productCode}x${item.quantity}`).join(" | "),
      ]),
    });
  };

  const exportExpensesCsv = () => {
    if (filteredExpenses.length === 0) {
      return;
    }

    downloadCsvReport({
      prefix: "cierre_gastos",
      from: expenseDateFrom,
      to: expenseDateTo,
      headers: [
        "fecha",
        "id",
        "chofer",
        "categoria",
        "monto",
        "descripcion",
        "comprobante",
      ],
      rows: filteredExpenses.map((expense) => [
        new Date(expense.createdAt).toISOString(),
        expense.id,
        expense.driverName,
        expense.category,
        expense.amount,
        expense.note ?? "",
        expense.receiptRef ?? "",
      ]),
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <nav className="flex gap-2 border-b border-slate-200" aria-label="Tipo de reporte">
        {(["ingresos", "gastos"] as const).map((option) => (
          <Link
            key={option}
            href={`/admin/reportes?tab=${option}`}
            aria-current={tab === option ? "page" : undefined}
            className={`rounded-t px-4 py-2 text-sm font-medium ${
              tab === option
                ? "border-b-2 border-sky-700 text-sky-800"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {option === "ingresos" ? "Ingresos" : "Gastos"}
          </Link>
        ))}
      </nav>

      <section
        className={`rounded-xl border border-slate-200 bg-white p-6 ${
          tab === "ingresos" ? "" : "hidden"
        }`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold">Ultimas ventas</h2>
          <p className="text-sm text-slate-600">
            {filteredSales.length} de {sales.length} ventas ·{" "}
            <strong className="text-sky-800">
              ${totalFacturadoFiltrado.toLocaleString("es-AR")}
            </strong>{" "}
            facturados
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-sm text-slate-600">
            Fecha desde
            <input
              type="date"
              value={saleDateFrom}
              onChange={(event) => setSaleDateFrom(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm text-slate-600">
            Fecha hasta
            <input
              type="date"
              value={saleDateTo}
              onChange={(event) => setSaleDateTo(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm text-slate-600">
            Estado
            <select
              value={saleStatusFilter}
              onChange={(event) => setSaleStatusFilter(event.target.value as SaleStatusFilter)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            >
              <option value="all">Todos</option>
              <option value="active">Activas</option>
              <option value="canceled">Anuladas</option>
            </select>
          </label>
          <label className="text-sm text-slate-600">
            Medio de pago
            <select
              value={salePaymentFilter}
              onChange={(event) => setSalePaymentFilter(event.target.value as PaymentFilter)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            >
              <option value="all">Todos</option>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-600">
            Producto
            <select
              value={saleProductFilter}
              onChange={(event) => setSaleProductFilter(event.target.value as ProductFilter)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            >
              <option value="all">Todos</option>
              {/* Del catalogo, no de una lista fija: si no, un producto creado
                  por el admin seria imposible de filtrar. Se incluyen los
                  dados de baja, porque sus ventas viejas siguen existiendo y
                  son justo las que alguien puede querer mirar. */}
              {filterProducts.map((product) => (
                <option key={product.code} value={product.code}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-600">
            Buscar cliente/tipo
            <input
              type="text"
              value={saleSearch}
              onChange={(event) => setSaleSearch(event.target.value)}
              placeholder="Ej: final, comercio, Perez"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm text-slate-600">
            Chofer
            <input
              type="text"
              value={saleDriverFilter}
              onChange={(event) => setSaleDriverFilter(event.target.value)}
              placeholder="Ej: chofer"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm text-slate-600">
            Camion
            <input
              type="text"
              value={saleTruckFilter}
              onChange={(event) => setSaleTruckFilter(event.target.value)}
              placeholder="Ej: CAMION-01"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={exportSalesCsv}
            disabled={loading || filteredSales.length === 0}
            className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Exportar CSV de ventas filtradas
          </button>
        </div>

        {authToken && loading && <p className="mt-4 text-slate-600">Cargando ventas...</p>}
        {!loading && error && <p className="mt-4 text-red-600">{error}</p>}
        {!loading && !error && filteredSales.length === 0 && (
          <p className="mt-4 text-slate-600">Todavia no hay ventas cargadas.</p>
        )}

        {!loading && !error && filteredSales.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4">Fecha</th>
                  <th className="py-2 pr-4">Chofer</th>
                  <th className="py-2 pr-4">Camion</th>
                  <th className="py-2 pr-4">Cliente</th>
                  <th className="py-2 pr-4">Tipo</th>
                  <th className="py-2 pr-4">Pago</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4">Total</th>
                  <th className="py-2 pr-4">Accion</th>
                  <th className="py-2 pr-4">Auditoria</th>
                </tr>
              </thead>
              <tbody>
                {pagedSales.map((sale) => (
                  <tr key={sale.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">
                      {new Date(sale.createdAt).toLocaleString("es-AR")}
                    </td>
                    <td className="py-2 pr-4">{sale.driverName}</td>
                    <td className="py-2 pr-4">{sale.truckCode ?? "-"}</td>
                    <td className="py-2 pr-4">{sale.customerName}</td>
                    <td className="py-2 pr-4">{sale.customerType}</td>
                    <td className="py-2 pr-4">{formatPaymentMethod(sale.paymentMethod)}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          sale.status === "active"
                            ? "rounded bg-emerald-100 px-2 py-1 text-emerald-700"
                            : "rounded bg-rose-100 px-2 py-1 text-rose-700"
                        }
                      >
                        {sale.status}
                      </span>
                      {sale.cancelReason && (
                        <p className="mt-1 text-xs text-rose-700">{sale.cancelReason}</p>
                      )}
                    </td>
                    <td className="py-2 pr-4 font-semibold">
                      ${sale.total.toLocaleString("es-AR")}
                    </td>
                    <td className="py-2 pr-4">
                      {sale.status === "active" ? (
                        <button
                          type="button"
                          onClick={() => cancelSale(sale)}
                          className="rounded bg-rose-600 px-3 py-1 text-white hover:bg-rose-700"
                        >
                          Anular
                        </button>
                      ) : (
                        <span className="text-xs text-slate-500">Sin acciones</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <button
                        type="button"
                        onClick={() => setSelectedSaleForAudit(sale)}
                        className="rounded bg-slate-700 px-3 py-1 text-white hover:bg-slate-800"
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <Pager
              page={currentSalesPage}
              totalPages={salesTotalPages}
              totalItems={filteredSales.length}
              itemLabel="ventas"
              onPrev={() => setSalesPage((prev) => Math.max(1, prev - 1))}
              onNext={() =>
                setSalesPage((prev) => Math.min(salesTotalPages, prev + 1))
              }
            />
          </div>
        )}
      </section>

      <section
        className={`rounded-xl border border-slate-200 bg-white p-6 ${
          tab === "gastos" ? "" : "hidden"
        }`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold">Ultimos gastos</h2>
          <p className="text-sm text-slate-600">
            {filteredExpenses.length} de {expenses.length} gastos ·{" "}
            <strong className="text-violet-700">
              ${totalGastosFiltrados.toLocaleString("es-AR")}
            </strong>{" "}
            en total
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-sm text-slate-600">
            Fecha desde
            <input
              type="date"
              value={expenseDateFrom}
              onChange={(event) => setExpenseDateFrom(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm text-slate-600">
            Fecha hasta
            <input
              type="date"
              value={expenseDateTo}
              onChange={(event) => setExpenseDateTo(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm text-slate-600">
            Categoria
            <select
              value={expenseCategoryFilter}
              onChange={(event) =>
                setExpenseCategoryFilter(event.target.value as ExpenseCategoryFilter)
              }
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            >
              <option value="all">Todas</option>
              {EXPENSE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={exportExpensesCsv}
            disabled={loading || filteredExpenses.length === 0}
            className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Exportar CSV de gastos filtrados
          </button>
        </div>

        {!loading && !error && filteredExpenses.length === 0 && authToken && (
          <p className="mt-4 text-slate-600">Todavia no hay gastos cargados.</p>
        )}

        {!loading && !error && filteredExpenses.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4">Fecha</th>
                  <th className="py-2 pr-4">Chofer</th>
                  <th className="py-2 pr-4">Categoria</th>
                  <th className="py-2 pr-4">Monto</th>
                  <th className="py-2 pr-4">Descripcion</th>
                  <th className="py-2 pr-4">Comprobante</th>
                </tr>
              </thead>
              <tbody>
                {pagedExpenses.map((expense) => {
                  const receiptUrl = resolveReceiptUrl(expense.receiptRef);

                  return (
                    <tr key={expense.id} className="border-b border-slate-100">
                      <td className="py-2 pr-4">
                        {new Date(expense.createdAt).toLocaleString("es-AR")}
                      </td>
                      <td className="py-2 pr-4">{expense.driverName}</td>
                      <td className="py-2 pr-4">{expense.category}</td>
                      <td className="py-2 pr-4 font-semibold">
                        ${expense.amount.toLocaleString("es-AR")}
                      </td>
                      <td className="py-2 pr-4">{expense.note ?? "-"}</td>
                      <td className="py-2 pr-4">
                        {receiptUrl ? (
                          <a
                            href={receiptUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 text-sky-700 hover:text-sky-900"
                          >
                            <img
                              src={receiptUrl}
                              alt="Comprobante"
                              className="h-12 w-12 rounded-md border border-slate-200 object-cover"
                            />
                            <span className="text-xs font-semibold">Ver</span>
                          </a>
                        ) : (
                          <span className="text-xs text-slate-500">Sin imagen</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <Pager
              page={currentExpensesPage}
              totalPages={expensesTotalPages}
              totalItems={filteredExpenses.length}
              itemLabel="gastos"
              onPrev={() => setExpensesPage((prev) => Math.max(1, prev - 1))}
              onNext={() =>
                setExpensesPage((prev) => Math.min(expensesTotalPages, prev + 1))
              }
            />
          </div>
        )}
      </section>

      {selectedSaleForAudit && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold">Detalle de venta</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Cliente: {selectedSaleForAudit.customerName} · ID: {selectedSaleForAudit.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSaleForAudit(null)}
                className="rounded bg-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-300"
              >
                Cerrar
              </button>
            </div>

            <section className="mt-4">
              <h4 className="text-sm font-semibold text-slate-700">Comprobante de pago</h4>
              {selectedSaleProofUrl ? (
                <a
                  href={selectedSaleProofUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-3 text-sky-700 hover:text-sky-900"
                >
                  <img
                    src={selectedSaleProofUrl}
                    alt="Comprobante de pago"
                    className="h-24 w-24 rounded-md border border-slate-200 object-cover"
                  />
                  <span className="text-xs font-semibold">Abrir en pestana nueva</span>
                </a>
              ) : (
                <p className="mt-1 text-sm text-slate-500">
                  {selectedSaleForAudit.paymentMethod === null ||
                  selectedSaleForAudit.paymentMethod === "efectivo"
                    ? "Sin comprobante (pago en efectivo, no aplica)."
                    : "El chofer no adjunto comprobante para esta venta."}
                </p>
              )}
            </section>

            <h4 className="mt-6 text-sm font-semibold text-slate-700">Auditoria</h4>

            {auditLoading && <p className="mt-4 text-slate-600">Cargando auditoria...</p>}

            {!auditLoading && audits.length === 0 && (
              <p className="mt-4 text-slate-600">Sin eventos de auditoria para esta venta.</p>
            )}

            {!auditLoading && audits.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-4">Fecha</th>
                      <th className="py-2 pr-4">Accion</th>
                      <th className="py-2 pr-4">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audits.map((audit) => (
                      <tr key={audit.id} className="border-b border-slate-100">
                        <td className="py-2 pr-4">
                          {new Date(audit.createdAt).toLocaleString("es-AR")}
                        </td>
                        <td className="py-2 pr-4">{audit.action}</td>
                        <td className="py-2 pr-4">{audit.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
