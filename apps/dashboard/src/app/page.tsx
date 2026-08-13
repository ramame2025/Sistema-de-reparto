"use client";

import { useEffect, useMemo, useState } from "react";
import LoginScreen from "../components/LoginScreen";
import {
  type AuthLoginResponse,
  type AuthSessionResponse,
  type CreateUserInput,
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  PRODUCT_CODES,
  type ExpenseCategory,
  type ExpenseRecord,
  type PaymentMethod,
  type ProductCode,
  type SaleAuditRecord,
  type SaleRecord,
  type UserRole,
  type UserSummary,
} from "@distribuidor/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const DASHBOARD_AUTH_TOKEN_KEY = "dashboard_auth_token_v1";

type AuthStatus = "checking" | "anonymous" | "authenticated";
type SaleStatusFilter = "all" | "active" | "canceled";
type PaymentFilter = "all" | PaymentMethod;
type ProductFilter = "all" | ProductCode;
type ExpenseCategoryFilter = "all" | ExpenseCategory;

const formatDateForFilename = (value: string) => value.replaceAll("-", "");

const buildDateRangeLabel = (from: string, to: string) => {
  if (from && to) {
    return from === to ? from : `${from}_to_${to}`;
  }

  if (from) {
    return `${from}_onward`;
  }

  if (to) {
    return `until_${to}`;
  }

  return new Date().toISOString().slice(0, 10);
};

const escapeCsvCell = (value: string | number | null | undefined) => {
  const raw = String(value ?? "");
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replaceAll("\"", "\"\"")}"`;
  }

  return raw;
};

const toCsv = (headers: string[], rows: Array<Array<string | number | null | undefined>>) => {
  const headerLine = headers.map((cell) => escapeCsvCell(cell)).join(",");
  const lines = rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(","));
  return [headerLine, ...lines].join("\n");
};

export default function Home() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [saleDateFrom, setSaleDateFrom] = useState("");
  const [saleDateTo, setSaleDateTo] = useState("");
  const [saleStatusFilter, setSaleStatusFilter] = useState<SaleStatusFilter>("all");
  const [salePaymentFilter, setSalePaymentFilter] = useState<PaymentFilter>("all");
  const [saleProductFilter, setSaleProductFilter] = useState<ProductFilter>("all");
  const [saleDriverFilter, setSaleDriverFilter] = useState("");
  const [saleTruckFilter, setSaleTruckFilter] = useState("");
  const [saleSearch, setSaleSearch] = useState("");
  const [expenseDateFrom, setExpenseDateFrom] = useState("");
  const [expenseDateTo, setExpenseDateTo] = useState("");
  const [expenseCategoryFilter, setExpenseCategoryFilter] =
    useState<ExpenseCategoryFilter>("all");
  const [selectedSaleForAudit, setSelectedSaleForAudit] = useState<SaleRecord | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [audits, setAudits] = useState<SaleAuditRecord[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [userNotice, setUserNotice] = useState<string | null>(null);
  const [newUserUsername, setNewUserUsername] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("chofer");
  const [creatingUser, setCreatingUser] = useState(false);

  const clearSession = () => {
    setAuthToken(null);
    setAuthStatus("anonymous");
    localStorage.removeItem(DASHBOARD_AUTH_TOKEN_KEY);
  };

  // Ante un 401/403 la sesion dejo de ser valida: volvemos al login.
  const handleAuthFailure = (response: Response) => {
    if (response.status === 401 || response.status === 403) {
      clearSession();
    }
  };

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
        handleAuthFailure(response);
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
        handleAuthFailure(expensesResponse);
        throw new Error(`API ${expensesResponse.status}`);
      }

      const expenseData: ExpenseRecord[] = await expensesResponse.json();
      setExpenses(expenseData);

      try {
        const usersResponse = await fetch(`${API_URL}/users`, {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        if (!usersResponse.ok) {
          handleAuthFailure(usersResponse);
          throw new Error(`API ${usersResponse.status}`);
        }

        const usersData: UserSummary[] = await usersResponse.json();
        setUsers(usersData);
        setUserError(null);
      } catch {
        setUserError("No se pudo cargar usuarios.");
      }
    } catch {
      setError("No se pudo cargar la lista de ventas.");
    } finally {
      setLoading(false);
    }
  };

  // Validamos el token guardado contra la API antes de mostrar el dashboard,
  // asi un token vencido o manipulado vuelve al login en vez de entrar.
  useEffect(() => {
    const savedToken = localStorage.getItem(DASHBOARD_AUTH_TOKEN_KEY);
    if (!savedToken) {
      setAuthStatus("anonymous");
      return;
    }

    let active = true;

    const verifySession = async () => {
      try {
        const response = await fetch(`${API_URL}/auth/me`, {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${savedToken}`,
          },
        });

        if (!response.ok) {
          throw new Error(`API ${response.status}`);
        }

        const session: AuthSessionResponse = await response.json();
        if (!active) {
          return;
        }

        if (session.role !== "admin") {
          throw new Error("role");
        }

        setAuthUsername(session.username);
        setAuthToken(savedToken);
        setAuthStatus("authenticated");
      } catch {
        if (!active) {
          return;
        }

        localStorage.removeItem(DASHBOARD_AUTH_TOKEN_KEY);
        setAuthToken(null);
        setAuthStatus("anonymous");
      }
    };

    void verifySession();

    return () => {
      active = false;
    };
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
      setAuthStatus("authenticated");
      setAuthPassword("");
      localStorage.setItem(DASHBOARD_AUTH_TOKEN_KEY, payload.accessToken);
    } catch {
      setAuthError("Credenciales invalidas o API no disponible.");
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = () => {
    clearSession();
    setAuthPassword("");
    setSales([]);
    setExpenses([]);
    setUsers([]);
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
        handleAuthFailure(response);
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
        handleAuthFailure(response);
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

  const refreshUsers = async () => {
    if (!authToken) {
      return;
    }

    try {
      setUsersLoading(true);
      setUserError(null);

      const response = await fetch(`${API_URL}/users`, {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        handleAuthFailure(response);
        throw new Error(`API ${response.status}`);
      }

      const payload: UserSummary[] = await response.json();
      setUsers(payload);
    } catch {
      setUserError("No se pudo cargar usuarios.");
    } finally {
      setUsersLoading(false);
    }
  };

  const createUser = async () => {
    if (!authToken) {
      return;
    }

    const payload: CreateUserInput = {
      username: newUserUsername,
      password: newUserPassword,
      role: newUserRole,
    };

    try {
      setCreatingUser(true);
      setUserError(null);
      setUserNotice(null);

      const response = await fetch(`${API_URL}/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        handleAuthFailure(response);
        throw new Error(`API ${response.status}`);
      }

      setNewUserUsername("");
      setNewUserPassword("");
      setNewUserRole("chofer");
      setUserNotice("Usuario creado correctamente.");
      await refreshUsers();
    } catch {
      setUserError("No se pudo crear el usuario.");
    } finally {
      setCreatingUser(false);
    }
  };

  const resetUserPassword = async (user: UserSummary) => {
    if (!authToken) {
      return;
    }

    const nextPassword = window.prompt(`Nueva password para ${user.username}`);
    if (!nextPassword) {
      return;
    }

    try {
      setUserError(null);
      setUserNotice(null);

      const response = await fetch(`${API_URL}/users/${user.id}/password`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ password: nextPassword }),
      });

      if (!response.ok) {
        handleAuthFailure(response);
        throw new Error(`API ${response.status}`);
      }

      setUserNotice(`Password actualizada para ${user.username}.`);
      await refreshUsers();
    } catch {
      setUserError("No se pudo actualizar la password.");
    }
  };

  const deleteUser = async (user: UserSummary) => {
    if (!authToken) {
      return;
    }

    const confirmed = window.confirm(`Eliminar usuario ${user.username}?`);
    if (!confirmed) {
      return;
    }

    try {
      setUserError(null);
      setUserNotice(null);

      const response = await fetch(`${API_URL}/users/${user.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        handleAuthFailure(response);
        throw new Error(`API ${response.status}`);
      }

      setUserNotice(`Usuario ${user.username} eliminado.`);
      await refreshUsers();
    } catch {
      setUserError("No se pudo eliminar el usuario.");
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

  const triggerCsvDownload = (filename: string, csvContent: string) => {
    const blob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const exportSalesCsv = () => {
    if (filteredSales.length === 0) {
      return;
    }

    const csv = toCsv(
      [
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
      filteredSales.map((sale) => [
        new Date(sale.createdAt).toISOString(),
        sale.id,
        sale.driverName,
        sale.truckCode ?? "",
        sale.customerName,
        sale.customerType,
        sale.paymentMethod,
        sale.status,
        sale.total,
        sale.cancelReason ?? "",
        sale.items.map((item) => `${item.productCode}x${item.quantity}`).join(" | "),
      ]),
    );

    const label = buildDateRangeLabel(saleDateFrom, saleDateTo);
    triggerCsvDownload(
      `cierre_ventas_${formatDateForFilename(label)}.csv`,
      csv,
    );
  };

  const exportExpensesCsv = () => {
    if (filteredExpenses.length === 0) {
      return;
    }

    const csv = toCsv(
      [
        "fecha",
        "id",
        "chofer",
        "categoria",
        "monto",
        "descripcion",
        "comprobante",
      ],
      filteredExpenses.map((expense) => [
        new Date(expense.createdAt).toISOString(),
        expense.id,
        expense.driverName,
        expense.category,
        expense.amount,
        expense.note ?? "",
        expense.receiptRef ?? "",
      ]),
    );

    const label = buildDateRangeLabel(expenseDateFrom, expenseDateTo);
    triggerCsvDownload(
      `cierre_gastos_${formatDateForFilename(label)}.csv`,
      csv,
    );
  };

  if (authStatus === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-900">
        <p className="text-sm text-slate-600">Verificando sesion...</p>
      </div>
    );
  }

  if (authStatus !== "authenticated") {
    return (
      <LoginScreen
        username={authUsername}
        password={authPassword}
        onUsernameChange={setAuthUsername}
        onPasswordChange={setAuthPassword}
        onSubmit={() => void login()}
        loading={authLoading}
        error={authError}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">
                Distribuidor · Dashboard Admin
              </p>
              <h1 className="mt-2 text-3xl font-bold">Sistema de Gestion de Reparto</h1>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Cerrar sesion
            </button>
          </div>
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
                  {filteredSales.map((sale) => (
                    <tr key={sale.id} className="border-b border-slate-100">
                      <td className="py-2 pr-4">
                        {new Date(sale.createdAt).toLocaleString("es-AR")}
                      </td>
                      <td className="py-2 pr-4">{sale.driverName}</td>
                      <td className="py-2 pr-4">{sale.truckCode ?? "-"}</td>
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

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold">Usuarios</h2>
          <p className="mt-2 text-sm text-slate-600">
            Gestion de cuentas para roles admin y chofer.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="text-sm text-slate-600">
              Usuario
              <input
                type="text"
                value={newUserUsername}
                onChange={(event) => setNewUserUsername(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm text-slate-600">
              Password
              <input
                type="password"
                value={newUserPassword}
                onChange={(event) => setNewUserPassword(event.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm text-slate-600">
              Rol
              <select
                value={newUserRole}
                onChange={(event) => setNewUserRole(event.target.value as UserRole)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              >
                <option value="chofer">chofer</option>
                <option value="admin">admin</option>
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void createUser()}
              disabled={creatingUser}
              className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {creatingUser ? "Creando..." : "Crear usuario"}
            </button>
            <button
              type="button"
              onClick={() => void refreshUsers()}
              disabled={usersLoading}
              className="rounded bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {usersLoading ? "Actualizando..." : "Actualizar lista"}
            </button>
          </div>

          {userError && <p className="mt-3 text-sm text-rose-700">{userError}</p>}
          {userNotice && <p className="mt-3 text-sm text-emerald-700">{userNotice}</p>}

          {!loading && users.length === 0 && (
            <p className="mt-4 text-sm text-slate-600">No hay usuarios cargados.</p>
          )}

          {users.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-4">Usuario</th>
                    <th className="py-2 pr-4">Rol</th>
                    <th className="py-2 pr-4">Creado</th>
                    <th className="py-2 pr-4">Actualizado</th>
                    <th className="py-2 pr-4">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-slate-100">
                      <td className="py-2 pr-4">{user.username}</td>
                      <td className="py-2 pr-4">{user.role}</td>
                      <td className="py-2 pr-4">{new Date(user.createdAt).toLocaleString("es-AR")}</td>
                      <td className="py-2 pr-4">{new Date(user.updatedAt).toLocaleString("es-AR")}</td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void resetUserPassword(user)}
                            className="rounded bg-amber-600 px-3 py-1 text-white hover:bg-amber-700"
                          >
                            Reset password
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteUser(user)}
                            className="rounded bg-rose-600 px-3 py-1 text-white hover:bg-rose-700"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
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
