import type { SaleRecord } from "@distribuidor/shared";
import { summarizeReturns } from "./returns";

const sale = (overrides: Partial<SaleRecord> = {}): SaleRecord =>
  ({
    id: "s-1",
    createdAt: "2026-09-10T14:00:00.000Z",
    occurredAt: "2026-09-10T14:00:00.000Z",
    status: "active",
    driverName: "chofer1",
    total: 0,
    customerName: "Kiosco Sur",
    customerType: "final",
    paymentMethod: null,
    items: [],
    kind: "churn",
    ...overrides,
  }) as SaleRecord;

const ALL_DATES = { from: "", to: "" };

describe("summarizeReturns", () => {
  it("agrupa por producto Y por motivo, sin mezclar vacios con falladas", () => {
    const result = summarizeReturns(
      [
        sale({
          returnItems: [
            { productCode: "G10", quantity: 2, reason: "empty" },
            { productCode: "G10", quantity: 1, reason: "faulty" },
            { productCode: "G15", quantity: 3, reason: "empty" },
          ],
        }),
      ],
      ALL_DATES,
    );

    expect(result.products).toEqual([
      { productCode: "G10", empty: 2, faulty: 1, total: 3 },
      { productCode: "G15", empty: 3, faulty: 0, total: 3 },
    ]);
  });

  it("suma el mismo producto y motivo a traves de varias visitas", () => {
    const result = summarizeReturns(
      [
        sale({ returnItems: [{ productCode: "G10", quantity: 2, reason: "empty" }] }),
        sale({
          id: "s-2",
          returnItems: [{ productCode: "G10", quantity: 5, reason: "empty" }],
        }),
      ],
      ALL_DATES,
    );

    expect(result.products).toEqual([
      { productCode: "G10", empty: 7, faulty: 0, total: 7 },
    ]);
    expect(result.totalEmpty).toBe(7);
    expect(result.totalFaulty).toBe(0);
  });

  it("reporta las devoluciones de una visita MIXTA, que ademas vendio y cobro", () => {
    // Vendio dos garrafas, recibio un envase vacio y cambio una fallada. Es
    // UNA fila `kind: 'sale'` (D1) y su reemplazo salio con `unitPrice: 0`.
    const mixta = sale({
      kind: "sale",
      total: 26000,
      paymentMethod: "efectivo",
      items: [
        { productCode: "G10", quantity: 2, unitPrice: 13000 },
        { productCode: "G10", quantity: 1, unitPrice: 0, isReplacement: true },
      ],
      returnItems: [
        { productCode: "G10", quantity: 1, reason: "empty" },
        { productCode: "G10", quantity: 1, reason: "faulty" },
      ],
    });

    const result = summarizeReturns([mixta], ALL_DATES);

    expect(result.products).toEqual([
      { productCode: "G10", empty: 1, faulty: 1, total: 2 },
    ]);
    expect(result.visitsWithReturns).toBe(1);
  });

  it("deja afuera una venta anulada: lo que nunca ocurrio no volvio", () => {
    const result = summarizeReturns(
      [
        sale({
          status: "canceled",
          returnItems: [{ productCode: "G10", quantity: 9, reason: "faulty" }],
        }),
      ],
      ALL_DATES,
    );

    expect(result.products).toEqual([]);
    expect(result.totalFaulty).toBe(0);
    expect(result.visitsWithReturns).toBe(0);
  });

  it("no se rompe con ventas viejas sin `returnItems`", () => {
    const result = summarizeReturns(
      [sale({ kind: "sale", total: 1000, returnItems: undefined })],
      ALL_DATES,
    );

    expect(result.products).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.visitsWithReturns).toBe(0);
  });

  it("devuelve ceros y no NaN cuando el rango no atrapa ninguna visita", () => {
    const result = summarizeReturns(
      [sale({ returnItems: [{ productCode: "G10", quantity: 2, reason: "empty" }] })],
      { from: "2026-01-01", to: "2026-01-31" },
    );

    expect(result).toEqual({
      products: [],
      totalEmpty: 0,
      totalFaulty: 0,
      total: 0,
      visitsWithReturns: 0,
    });
  });

  it("devuelve ceros y no NaN con un dataset vacio", () => {
    expect(summarizeReturns([], ALL_DATES)).toEqual({
      products: [],
      totalEmpty: 0,
      totalFaulty: 0,
      total: 0,
      visitsWithReturns: 0,
    });
  });

  it("acota el rango por dia calendario, con los dos extremos incluidos", () => {
    const sales = [
      sale({
        id: "antes",
        occurredAt: "2026-09-09T23:59:00.000Z",
        returnItems: [{ productCode: "G10", quantity: 1, reason: "empty" }],
      }),
      sale({
        id: "desde",
        occurredAt: "2026-09-10T00:05:00.000Z",
        returnItems: [{ productCode: "G10", quantity: 2, reason: "empty" }],
      }),
      sale({
        id: "hasta",
        occurredAt: "2026-09-12T23:50:00.000Z",
        returnItems: [{ productCode: "G10", quantity: 4, reason: "empty" }],
      }),
      sale({
        id: "despues",
        occurredAt: "2026-09-13T00:01:00.000Z",
        returnItems: [{ productCode: "G10", quantity: 8, reason: "empty" }],
      }),
    ];

    const result = summarizeReturns(sales, { from: "2026-09-10", to: "2026-09-12" });

    expect(result.totalEmpty).toBe(6);
  });

  it("un extremo vacio no acota de ese lado", () => {
    const sales = [
      sale({
        id: "vieja",
        occurredAt: "2020-01-01T10:00:00.000Z",
        returnItems: [{ productCode: "G10", quantity: 1, reason: "empty" }],
      }),
      sale({
        id: "nueva",
        occurredAt: "2026-09-10T10:00:00.000Z",
        returnItems: [{ productCode: "G10", quantity: 2, reason: "empty" }],
      }),
    ];

    expect(summarizeReturns(sales, { from: "", to: "2026-09-10" }).totalEmpty).toBe(3);
    expect(summarizeReturns(sales, { from: "2026-09-01", to: "" }).totalEmpty).toBe(2);
  });

  it("usa `occurredAt` y no `createdAt`: lo que volvio, volvio en la calle", () => {
    // Una visita sin senal se sincroniza dias despues. El envase volvio el
    // dia de la visita, no el dia en que el telefono consiguio senal.
    const result = summarizeReturns(
      [
        sale({
          occurredAt: "2026-09-10T10:00:00.000Z",
          createdAt: "2026-09-14T10:00:00.000Z",
          returnItems: [{ productCode: "G10", quantity: 3, reason: "faulty" }],
        }),
      ],
      { from: "2026-09-10", to: "2026-09-10" },
    );

    expect(result.totalFaulty).toBe(3);
  });

  it("cae en `createdAt` cuando la fila no trae `occurredAt`", () => {
    const result = summarizeReturns(
      [
        sale({
          occurredAt: undefined as unknown as string,
          createdAt: "2026-09-10T10:00:00.000Z",
          returnItems: [{ productCode: "G10", quantity: 3, reason: "empty" }],
        }),
      ],
      { from: "2026-09-10", to: "2026-09-10" },
    );

    expect(result.totalEmpty).toBe(3);
  });

  it("ordena por unidades devueltas y desempata por codigo", () => {
    const result = summarizeReturns(
      [
        sale({
          returnItems: [
            { productCode: "G45", quantity: 1, reason: "empty" },
            { productCode: "G15", quantity: 9, reason: "empty" },
            { productCode: "G10", quantity: 1, reason: "faulty" },
          ],
        }),
      ],
      ALL_DATES,
    );

    expect(result.products.map((row) => row.productCode)).toEqual([
      "G15",
      "G10",
      "G45",
    ]);
  });

  it("cuenta una sola vez la visita que devolvio varias lineas", () => {
    const result = summarizeReturns(
      [
        sale({
          returnItems: [
            { productCode: "G10", quantity: 1, reason: "empty" },
            { productCode: "G15", quantity: 1, reason: "faulty" },
          ],
        }),
        sale({ id: "s-2", returnItems: [] }),
      ],
      ALL_DATES,
    );

    expect(result.visitsWithReturns).toBe(1);
    expect(result.total).toBe(2);
  });
});
