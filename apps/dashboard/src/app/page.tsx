"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type AuthLoginResponse,
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  PRODUCT_CODES,
  type ExpenseCategory,
  type ExpenseRecord,
  type PaymentMethod,
  type ProductCode,
  type SaleAuditRecord,
  type SaleRecord,
} from "@distribuidor/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const DASHBOARD_AUTH_TOKEN_KEY = "dashboard_auth_token_v1";

type SaleStatusFilter = "all" | "active" | "canceled";
type PaymentFilter = "all" | PaymentMethod;
type ProductFilter = "all" | ProductCode;
type ExpenseCategoryFilter = "all" | ExpenseCategory;

export default function Home() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authUsername, setAuthUsername] = useState(
    process.env.NEXT_PUBLIC_ADMIN_USERNAME ?? "admin",
  );
  const [authPassword, setAuthPassword] = useState(
    process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "admin123",
  );
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [saleDateFrom, setSaleDateFrom] = useState("");
  const [saleDateTo, setSaleDateTo] = useState("");
  const [saleStatusFilter, setSaleStatusFilter] = useState<SaleStatusFilter>("all");
  const [salePaymentFilter, setSalePaymentFilter] = useState<PaymentFilter>("all");
  const [saleProductFilter, setSaleProductFilter] = useState<ProductFilter>("all");
  const [saleSearch, setSaleSearch] = useState("");
  const [expenseDateFrom, setExpenseDateFrom] = useState("");
  const [expenseDateTo, setExpenseDateTo] = useState("");
  const [expenseCategoryFilter, setExpenseCategoryFilter] =
    useState<ExpenseCategoryFilter>("all");
  const [selectedSaleForAudit, setSelectedSaleForAudit] = useState<SaleRecord | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [audits, setAudits] = useState<SaleAuditRecord[]>([]);

  const loadSales = async () => {
    if (!authToken) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_URL}/sales`, {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setAuthToken(null);
          localStorage.removeItem(DASHBOARD_AUTH_TOKEN_KEY);
        }
        throw new Error(`API ${response.status}`);
      }

      const data: SaleRecord[] = await response.json();
      setSales(data);

      const expensesResponse = await fetch(`${API_URL}/expenses`, {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!expensesResponse.ok) {
        throw new Error(`API ${expensesResponse.status}`);
      }

      const expenseData: ExpenseRecord[] = await expensesResponse.json();
      setExpenses(expenseData);
    } catch {
      setError("No se pudo cargar la lista de ventas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedToken = localStorage.getItem(DASHBOARD_AUTH_TOKEN_KEY);
    if (savedToken) {
      setAuthToken(savedToken);
    }
  }, []);

  useEffect(() => {
    if (!authToken) {
      return;
    }

    void loadSales();
  }, [authToken]);

  const login = async () => {
    try {
      setAuthLoading(true);
      setAuthError(null);

      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: authUsername, password: authPassword }),
      });

      if (!response.ok) {
        throw new Error(`API ${response.status}`);
      }

      const payload: AuthLoginResponse = await response.json();
      if (payload.role !== "admin") {
        setAuthError("Este usuario no tiene permisos de administrador.");
        return;
      }

      setAuthToken(payload.accessToken);
      localStorage.setItem(DASHBOARD_AUTH_TOKEN_KEY, payload.accessToken);
    } catch {
      setAuthError("Credenciales invalidas o API no disponible.");
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = () => {
    setAuthToken(null);
    localStorage.removeItem(DASHBOARD_AUTH_TOKEN_KEY);
  };

  const cancelSale = async (sale: SaleRecord) => {
    const reason = window.prompt("Motivo de anulacion", "Error de carga");
    if (!reason) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/sales/${sale.id}/cancel`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) {
        throw new Error(`API ${response.status}`);
      }

      await loadSales();
    } catch {
      setError("No se pudo anular la venta.");
    }
  };

  const showAudits = async (sale: SaleRecord) => {
    try {
      setSelectedSaleForAudit(sale);
      setAuditLoading(true);
      setAudits([]);
      const response = await fetch(`${API_URL}/sales/${sale.id}/audits`, {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`API ${response.status}`);
      }

      const data: SaleAuditRecord[] = await response.json();
      setAudits(data);
    } catch {
      setError("No se pudo cargar la auditoria de la venta.");
      setSelectedSaleForAudit(null);
    } finally {
      setAuditLoading(false);
    }
  };

  const closeAuditModal = () => {
    setSelectedSaleForAudit(null);
    setAudits([]);
    setAuditLoading(false);
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

      return true;
    });
  }, [
    sales,
    saleDateFrom,
    saleDateTo,
    saleStatusFilter,
    salePaymentFilter,
    saleProductFilter,
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

  const totalFacturado = useMemo(
    () => sales.reduce((acc, sale) => acc + sale.total, 0),
    [sales],
  );

  const totalGastos = useMemo(
    () => expenses.reduce((acc, expense) => acc + expense.amount, 0),
    [expenses],
  );

  const totalFacturadoFiltrado = useMemo(
    () => filteredSales.reduce((acc, sale) => acc + sale.total, 0),
    [filteredSales],
  );

  const totalGastosFiltrados = useMemo(
    () => filteredExpenses.reduce((acc, expense) => acc + expense.amount, 0),
    [filteredExpenses],
  );

  const resolveReceiptUrl = (receiptRef?: string) => {
    if (!receiptRef) {
      return null;
    }

    if (receiptRef.startsWith("http://") || receiptRef.startsWith("https://")) {
      return receiptRef;
    }

    if (receiptRef.startsWith("/")) {
      return `${API_URL}${receiptRef}`;
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        {!authToken && (
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-xl font-semibold">Login admin</h2>
            <p className="mt-2 text-sm text-slate-600">
              Inicia sesion para acceder a ventas, auditoria y gastos.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm text-slate-600">
                Usuario
                <input
                  type="text"
                  value={authUsername}
                  onChange={(event) => setAuthUsername(event.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm text-slate-600">
                Password
                <input
                  type="password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => void login()}
              disabled={authLoading}
              className="mt-4 rounded bg-sky-700 px-4 py-2 font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {authLoading ? "Ingresando..." : "Ingresar"}
            </button>
            {authError && <p className="mt-3 text-sm text-rose-700">{authError}</p>}
          </section>
        )}

        {authToken && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={logout}
              className="rounded bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Cerrar sesion
            </button>
          </div>
        )}

        <header className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">
            Distribuidor · Dashboard Admin
          </p>
          <h1 className="mt-2 text-3xl font-bold">Sistema de Gestion de Reparto</h1>
          <p className="mt-3 text-slate-600">
            Vista inicial de ventas registradas desde la app del chofer.
          </p>
        </header>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold">Resumen rapido</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Ventas registradas</p>
              <p className="text-2xl font-bold">{sales.length}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Facturacion total</p>
              <p className="text-2xl font-bold text-sky-800">
                ${totalFacturado.toLocaleString("es-AR")}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Gastos registrados</p>
              <p className="text-2xl font-bold text-violet-700">
                ${totalGastos.toLocaleString("es-AR")}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Facturacion (filtros)</p>
              <p className="text-2xl font-bold text-sky-700">
                ${totalFacturadoFiltrado.toLocaleString("es-AR")}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Gastos (filtros)</p>
              <p className="text-2xl font-bold text-violet-700">
                ${totalGastosFiltrados.toLocaleString("es-AR")}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold">Ultimas ventas</h2>

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
                {PRODUCT_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code}
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
                  {filteredSales.map((sale) => (
                    <tr key={sale.id} className="border-b border-slate-100">
                      <td className="py-2 pr-4">
                        {new Date(sale.createdAt).toLocaleString("es-AR")}
                      </td>
                      <td className="py-2 pr-4">{sale.customerName}</td>
                      <td className="py-2 pr-4">{sale.customerType}</td>
                      <td className="py-2 pr-4">{sale.paymentMethod}</td>
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
                          onClick={() => showAudits(sale)}
                          className="rounded bg-slate-700 px-3 py-1 text-white hover:bg-slate-800"
                        >
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold">Ultimos gastos</h2>

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
                  {filteredExpenses.map((expense) => {
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
            </div>
          )}
        </section>

        {selectedSaleForAudit && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold">Auditoria de venta</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Cliente: {selectedSaleForAudit.customerName} · ID: {selectedSaleForAudit.id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeAuditModal}
                  className="rounded bg-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-300"
                >
                  Cerrar
                </button>
              </div>

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
      </main>
    </div>
  );
}
