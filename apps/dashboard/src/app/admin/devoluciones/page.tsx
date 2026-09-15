"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { ProductRecord, SaleRecord } from "@distribuidor/shared";
import { isoDateDaysAgo, todayIsoDate } from "../../../lib/dates";
import { summarizeReturns } from "../../../lib/returns";

/**
 * El nombre del producto, con el codigo como respaldo. Un producto dado de
 * baja sigue teniendo devoluciones viejas, y mostrarlo como "G10" a secas
 * obliga al admin a traducir de memoria.
 */
const productLabel = (products: ProductRecord[], code: string): string =>
  products.find((product) => product.code === code)?.name ?? code;

export default function DevolucionesPage() {
  // Por defecto, la ultima semana: el mismo criterio que el resto de los
  // reportes. El rango es lo primero que se toca en esta pantalla, asi que
  // vive arriba de la tabla y no escondido.
  const [from, setFrom] = useState(() => isoDateDaysAgo(7));
  const [to, setTo] = useState(() => todayIsoDate());

  const {
    data: sales = [],
    isLoading: salesLoading,
    error: salesError,
  } = useSWR<SaleRecord[]>("/sales");

  // Con `includeInactive`: un producto retirado del catalogo sigue teniendo
  // envases que volvieron, y sin el la tabla mostraria su codigo crudo.
  const { data: products = [] } = useSWR<ProductRecord[]>(
    "/products?includeInactive=true",
  );

  const error = salesError ? "No se pudo cargar lo que volvio de la calle." : null;

  const returns = useMemo(() => summarizeReturns(sales, { from, to }), [sales, from, to]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold">Devoluciones y cambios</h2>
          <Link
            href="/admin/reportes"
            className="text-sm font-medium text-sky-700 underline hover:text-sky-900"
          >
            Ver las visitas una por una
          </Link>
        </div>

        {/*
          El aviso va arriba y en el cuerpo de la pagina, igual que en cuentas
          por cobrar: un reporte que no aclara que es cada motivo obliga a
          adivinar, y lo que se adivina no se usa para decidir nada.
        */}
        <div className="mt-4 rounded-lg border border-sky-300 bg-sky-50 p-4 text-sm text-sky-900">
          <p className="font-semibold">Que cuenta cada columna</p>
          <p className="mt-2">
            <strong>Envases vacios</strong>: el cliente devolvio el envase y no se le
            entrego nada a cambio. Es el envase que vuelve al deposito para volver a
            llenarse.
          </p>
          <p className="mt-2">
            <strong>Unidades falladas</strong>: se retiro una unidad con falla y se
            entrego una de reemplazo sin cargo, de la misma cantidad y del mismo
            producto. La fallada no se puede revender; es la que hay que reclamarle al
            proveedor.
          </p>
          <p className="mt-2">
            Este reporte cuenta unidades, no plata. Una unidad de reemplazo sale del
            camion sin cargo, asi que no tiene importe que sumar: ponerle el precio de
            lista inventaria una facturacion que nunca existio.
          </p>
          <p className="mt-2">
            Se cuenta por el dia en que ocurrio la visita, no por el dia en que el
            telefono la sincronizo. Las visitas anuladas no entran.
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-600">
            Fecha desde
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm text-slate-600">
            Fecha hasta
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
        </div>

        {salesLoading && <p className="mt-4 text-slate-600">Cargando devoluciones...</p>}
        {error && <p className="mt-4 text-sm text-rose-700">{error}</p>}

        {!salesLoading && !error && (
          <>
            <div
              data-testid="totales-devoluciones"
              className="mt-4 grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2"
            >
              <div>
                <p className="text-sm text-slate-500">Envases vacios</p>
                <p className="text-2xl font-bold text-sky-800">
                  {returns.totalEmpty} envases vacios
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Unidades falladas</p>
                <p className="text-2xl font-bold text-amber-700">
                  {returns.totalFaulty} unidades falladas
                </p>
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              {returns.total} unidades en total, de {returns.visitsWithReturns} visitas.
            </p>

            {returns.products.length === 0 ? (
              <p className="mt-4 text-slate-600">
                No volvio nada en el rango elegido.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Producto</th>
                      <th className="py-2 pr-4 font-medium">Envases vacios</th>
                      <th className="py-2 pr-4 font-medium">Unidades falladas</th>
                      <th className="py-2 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returns.products.map((row) => (
                      <tr
                        key={row.productCode}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="py-2 pr-4">
                          {productLabel(products, row.productCode)}
                        </td>
                        <td className="py-2 pr-4 text-slate-700">{row.empty}</td>
                        <td className="py-2 pr-4 text-amber-800">{row.faulty}</td>
                        <td className="py-2 font-semibold">{row.total}</td>
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
