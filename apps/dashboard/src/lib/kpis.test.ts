import { summarize } from "./kpis";
import type { ExpenseRecord, SaleRecord } from "@distribuidor/shared";

const sale = (overrides: Partial<SaleRecord> = {}): SaleRecord =>
  ({
    id: "s-1",
    createdAt: "2026-08-21T14:00:00.000Z",
    status: "active",
    driverName: "juan",
    total: 1000,
    customerName: "cliente",
    customerType: "final",
    paymentMethod: "efectivo",
    items: [],
    kind: "sale",
    ...overrides,
  }) as SaleRecord;

const expense = (amount: number, id = "e-1"): ExpenseRecord =>
  ({
    id,
    createdAt: "2026-08-21T14:00:00.000Z",
    driverName: "juan",
    category: "combustible",
    amount,
  }) as ExpenseRecord;

describe("summarize", () => {
  it("does not count canceled sales: una venta anulada nunca facturo", () => {
    const result = summarize(
      [sale({ total: 1000 }), sale({ id: "s-2", total: 500, status: "canceled" })],
      [],
      "2026-08-21",
    );

    expect(result.facturado).toBe(1000);
    expect(result.ventasActivas).toBe(1);
  });

  it("computes neto as billed minus expenses", () => {
    const result = summarize([sale({ total: 1000 })], [expense(300)], "2026-08-21");

    expect(result.gastos).toBe(300);
    expect(result.neto).toBe(700);
  });

  it("reports a negative neto instead of clamping it to zero", () => {
    // Un periodo con mas gastos que ventas es informacion, no un error a esconder.
    const result = summarize([sale({ total: 100 })], [expense(500)], "2026-08-21");

    expect(result.neto).toBe(-400);
  });

  it("counts today by calendar day, ignoring the time of the sale", () => {
    const result = summarize(
      [
        sale({ createdAt: "2026-08-21T03:00:00.000Z", total: 100 }),
        sale({ id: "s-2", createdAt: "2026-08-21T23:30:00.000Z", total: 200 }),
        sale({ id: "s-3", createdAt: "2026-08-20T23:30:00.000Z", total: 999 }),
      ],
      [],
      "2026-08-21",
    );

    expect(result.ventasHoy).toBe(2);
    expect(result.facturadoHoy).toBe(300);
  });

  it("excludes a canceled sale from today's total too", () => {
    const result = summarize(
      [sale({ total: 100 }), sale({ id: "s-2", total: 900, status: "canceled" })],
      [],
      "2026-08-21",
    );

    expect(result.facturadoHoy).toBe(100);
  });

  it("returns zeros for an empty dataset instead of NaN", () => {
    expect(summarize([], [], "2026-08-21")).toEqual({
      facturado: 0,
      gastos: 0,
      neto: 0,
      ventasActivas: 0,
      ventasHoy: 0,
      facturadoHoy: 0,
      visitasAtendidas: 0,
      visitasHoy: 0,
    });
  });

  // Pregunta A del plan container-swap.md: un cambio y una devolucion NO son
  // ventas. Contarlas como ventas de $0 bajaria el ticket promedio de
  // cualquier lectura futura.
  it("no cuenta un swap puro como venta, pero si como visita atendida", () => {
    const result = summarize(
      [
        sale({ total: 1000 }),
        sale({ id: "s-2", total: 0, kind: "swap", paymentMethod: null }),
      ],
      [],
      "2026-08-21",
    );

    expect(result.ventasActivas).toBe(1);
    expect(result.ventasHoy).toBe(1);
    expect(result.visitasAtendidas).toBe(1);
    expect(result.visitasHoy).toBe(1);
  });

  it("cuenta la devolucion (churn) como visita atendida, igual que el swap", () => {
    const result = summarize(
      [sale({ id: "s-2", total: 0, kind: "churn", paymentMethod: null })],
      [],
      "2026-08-21",
    );

    expect(result.ventasActivas).toBe(0);
    expect(result.visitasAtendidas).toBe(1);
  });

  it("cuenta como venta la visita MIXTA: vendio algo, asi que cobra", () => {
    // Vendio dos garrafas, recibio un vacio y cambio una fallada. Es UNA fila
    // `kind: 'sale'` y cobra solo lo vendido (D1/D4 del plan).
    const result = summarize(
      [
        sale({
          total: 26000,
          kind: "sale",
          items: [
            { productCode: "G10", quantity: 2, unitPrice: 13000 },
            { productCode: "G10", quantity: 1, unitPrice: 0, isReplacement: true },
          ],
          returnItems: [
            { productCode: "G10", quantity: 1, reason: "empty" },
            { productCode: "G10", quantity: 1, reason: "faulty" },
          ],
        }),
      ],
      [],
      "2026-08-21",
    );

    expect(result.ventasActivas).toBe(1);
    expect(result.visitasAtendidas).toBe(0);
    expect(result.facturado).toBe(26000);
  });

  it("no mueve `facturado` por swaps ni churns: no hay plata que sumar", () => {
    const result = summarize(
      [
        sale({ total: 1000 }),
        sale({ id: "s-2", total: 0, kind: "swap", paymentMethod: null }),
        sale({ id: "s-3", total: 0, kind: "churn", paymentMethod: null }),
      ],
      [],
      "2026-08-21",
    );

    expect(result.facturado).toBe(1000);
    expect(result.facturadoHoy).toBe(1000);
  });

  it("no cuenta como visita atendida un swap anulado", () => {
    const result = summarize(
      [sale({ id: "s-2", total: 0, kind: "swap", status: "canceled" })],
      [],
      "2026-08-21",
    );

    expect(result.visitasAtendidas).toBe(0);
    expect(result.visitasHoy).toBe(0);
  });

  it("trata como venta una fila vieja sin `kind`, que es lo que era", () => {
    const result = summarize(
      [sale({ kind: undefined as unknown as SaleRecord["kind"] })],
      [],
      "2026-08-21",
    );

    expect(result.ventasActivas).toBe(1);
    expect(result.visitasAtendidas).toBe(0);
  });
});
