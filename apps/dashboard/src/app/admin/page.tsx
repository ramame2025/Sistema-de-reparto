"use client";

import { useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { ExpenseRecord, SaleRecord } from "@distribuidor/shared";
import { summarize } from "../../lib/kpis";

const money = (amount: number) => `$${amount.toLocaleString("es-AR")}`;

/** Un dia calendario en zona del negocio, para "hoy" en los indicadores. */
const businessToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());

function Kpi({
  label,
  value,
  tone = "text-slate-900",
  hint,
}: {
  label: string;
  value: string;
  tone?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const {
    data: sales = [],
    isLoading: salesLoading,
    error: salesError,
  } = useSWR<SaleRecord[]>("/sales");
  const {
    data: expenses = [],
    isLoading: expensesLoading,
    error: expensesError,
  } = useSWR<ExpenseRecord[]>("/expenses");

  const loading = salesLoading || expensesLoading;
  const error =
    salesError || expensesError ? "No se pudieron cargar los indicadores." : null;

  const kpis = useMemo(
    () => summarize(sales, expenses, businessToday()),
    [sales, expenses],
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold">Resumen</h2>
          <Link
            href="/admin/reportes"
            className="text-sm font-medium text-sky-700 underline hover:text-sky-900"
          >
            Ver reportes con filtros
          </Link>
        </div>

        {loading && <p className="mt-4 text-slate-600">Cargando indicadores...</p>}
        {error && <p className="mt-4 text-sm text-rose-700">{error}</p>}

        {!loading && !error && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Kpi
              label="Facturado hoy"
              value={money(kpis.facturadoHoy)}
              tone="text-sky-800"
              hint={`${kpis.ventasHoy} ventas`}
            />
            <Kpi
              label="Neto acumulado"
              value={money(kpis.neto)}
              tone={kpis.neto >= 0 ? "text-emerald-700" : "text-rose-700"}
              hint="facturado menos gastos"
            />
            <Kpi
              label="Facturacion total"
              value={money(kpis.facturado)}
              tone="text-sky-800"
              hint={`${kpis.ventasActivas} ventas activas`}
            />
            <Kpi
              label="Gastos registrados"
              value={money(kpis.gastos)}
              tone="text-violet-700"
              hint={`${expenses.length} gastos`}
            />
          </div>
        )}
      </section>
    </div>
  );
}
