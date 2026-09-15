"use client";

import { useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { PaymentMethodRecord, SaleRecord } from "@distribuidor/shared";
import { summarizeReceivables } from "../../../lib/receivables";

const money = (amount: number) => `$${amount.toLocaleString("es-AR")}`;

export default function CuentasPorCobrarPage() {
  const {
    data: sales = [],
    isLoading: salesLoading,
    error: salesError,
  } = useSWR<SaleRecord[]>("/sales", { refreshInterval: 15000 });

  // Con `includeInactive`: un medio que deja deuda y se dio de baja sigue
  // teniendo ventas viejas a cuenta. Sin el, esas ventas desaparecerian de
  // la vista el dia que se desactive el medio, y la deuda no desaparece.
  const {
    data: paymentMethods = [],
    isLoading: methodsLoading,
    error: methodsError,
  } = useSWR<PaymentMethodRecord[]>("/payment-methods?includeInactive=true");

  const loading = salesLoading || methodsLoading;
  const error =
    salesError || methodsError ? "No se pudieron cargar las cuentas por cobrar." : null;

  const receivables = useMemo(
    () => summarizeReceivables(sales, paymentMethods),
    [sales, paymentMethods],
  );

  const debtMethods = paymentMethods.filter((method) => method.createsDebt);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold">Cuentas por cobrar</h2>
          <Link
            href="/admin/reportes"
            className="text-sm font-medium text-sky-700 underline hover:text-sky-900"
          >
            Ver reportes con filtros
          </Link>
        </div>

        {/*
          El aviso va arriba, en el cuerpo de la pagina y no en un tooltip: es
          la unica proteccion contra leer este numero como si fuera el saldo
          del cliente. Ver la seccion Risks del plan current-account-sales.md.
        */}
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">
            Este total es lo VENDIDO a cuenta, no el saldo actual del cliente.
          </p>
          <p className="mt-2">
            Los cobros todavia no estan implementados: el sistema no tiene forma de
            registrar un pago, asi que ningun pago baja estos numeros. Si un cliente
            ya pago, aca va a seguir figurando el monto completo.
          </p>
          <p className="mt-2">
            Las dos cifras coinciden solo hasta el primer cobro. A partir de ahi, lo
            vendido a cuenta es siempre mayor o igual a lo que el cliente realmente
            debe. Antes de reclamar un pago hay que verificarlo por fuera del sistema.
          </p>
        </div>

        {loading && <p className="mt-4 text-slate-600">Cargando cuentas por cobrar...</p>}
        {error && <p className="mt-4 text-sm text-rose-700">{error}</p>}

        {!loading && !error && (
          <>
            <div className="mt-4 rounded-lg bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Total vendido a cuenta</p>
              <p className="text-2xl font-bold text-sky-800">
                {money(receivables.totalSoldOnAccount)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {receivables.salesCount} ventas activas · {receivables.groups.length}{" "}
                clientes
              </p>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              Entran las ventas activas cuyo medio de pago deja deuda
              {debtMethods.length > 0
                ? `: ${debtMethods.map((method) => method.name).join(", ")}.`
                : ". Hoy no hay ningun medio de pago configurado asi."}{" "}
              Las ventas anuladas no cuentan: una venta anulada no es deuda.
            </p>

            {receivables.unidentifiedCount > 0 && (
              <p className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                Hay {receivables.unidentifiedCount} ventas a cuenta sin cliente del
                padron. Quedan juntas en la ultima fila porque no se le pueden
                atribuir a nadie; para separarlas hay que corregir cada venta.
              </p>
            )}

            {receivables.groups.length === 0 ? (
              <p className="mt-4 text-slate-600">No hay ventas a cuenta registradas.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Cliente</th>
                      <th className="py-2 pr-4 font-medium">Ventas a cuenta</th>
                      <th className="py-2 font-medium">Vendido a cuenta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receivables.groups.map((group) => (
                      <tr
                        key={group.customerId ?? "sin-cliente"}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="py-2 pr-4">
                          {group.identified ? (
                            group.customerName
                          ) : (
                            <span className="text-amber-800">{group.customerName}</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-slate-600">{group.salesCount}</td>
                        <td className="py-2 font-semibold text-sky-800">
                          {money(group.soldOnAccount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
