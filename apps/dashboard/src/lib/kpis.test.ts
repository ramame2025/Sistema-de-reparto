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
    });
  });
});
