import type { SaleRecord } from "@distribuidor/shared";
import {
  formatPaymentMethod,
  formatReturnItems,
  formatReturnReason,
  formatSaleKind,
  formatTruckCapacities,
} from "./format";

const buildChurnSale = (): SaleRecord => ({
  id: "sale-1",
  createdAt: new Date().toISOString(),
  occurredAt: new Date().toISOString(),
  status: "active",
  driverName: "Chofer Test",
  total: 0,
  customerName: "Cliente Test",
  customerType: "final",
  paymentMethod: null,
  items: [],
  kind: "churn",
  containerReturned: true,
});

describe("formatPaymentMethod", () => {
  it("returns a readable placeholder for a churn sale (paymentMethod: null)", () => {
    const churnSale = buildChurnSale();

    expect(formatPaymentMethod(churnSale.paymentMethod)).toBe("Sin pago");
  });

  it("returns the payment method as-is for a normal sale", () => {
    expect(formatPaymentMethod("efectivo")).toBe("efectivo");
  });
});

describe("formatTruckCapacities", () => {
  // Una grilla vacia es "nadie la cargo todavia". Un 0 diria que el camion no
  // lleva nada, que es una afirmacion distinta y falsa.
  it("reads 'sin detallar' for a truck with no capacity rows", () => {
    expect(formatTruckCapacities([])).toBe("sin detallar");
  });

  it("lists every product with its units", () => {
    expect(
      formatTruckCapacities([
        { productCode: "G10", units: 30 },
        { productCode: "G45", units: 12 },
      ]),
    ).toBe("G10 30 · G45 12");
  });

  // 0 es una respuesta cargada: este producto no viaja en este camion.
  it("keeps a product declared with 0 units visible", () => {
    expect(formatTruckCapacities([{ productCode: "G45", units: 0 }])).toBe("G45 0");
  });
});

describe("formatSaleKind", () => {
  // Un swap tiene que leerse como un cambio, no como una venta de $0 sin
  // explicacion. Es el punto (a) de la fase 3 del plan container-swap.md.
  it("reads a swap as a 'Cambio', never as a sale", () => {
    expect(formatSaleKind("swap")).toBe("Cambio");
  });

  it("reads a churn as a 'Visita'", () => {
    expect(formatSaleKind("churn")).toBe("Visita");
  });

  it("reads a sale as a 'Venta'", () => {
    expect(formatSaleKind("sale")).toBe("Venta");
  });

  // Una fila vieja sin `kind` es una venta: los cambios no existian.
  it("treats a row with no kind as a sale", () => {
    expect(formatSaleKind(undefined)).toBe("Venta");
  });
});

describe("formatReturnReason", () => {
  // En castellano llano: sin esto, el reporte dice "empty" y "faulty" y nadie
  // lo usa.
  it("explains 'empty' as an envase vacio", () => {
    expect(formatReturnReason("empty")).toBe("Envase vacio");
  });

  it("explains 'faulty' as a unidad fallada", () => {
    expect(formatReturnReason("faulty")).toBe("Unidad fallada");
  });
});

describe("formatReturnItems", () => {
  it("lists what came back with its reason, for the sales CSV", () => {
    expect(
      formatReturnItems([
        { productCode: "G10", quantity: 1, reason: "empty" },
        { productCode: "G10", quantity: 2, reason: "faulty" },
      ]),
    ).toBe("G10x1 (Envase vacio) | G10x2 (Unidad fallada)");
  });

  // Una venta vieja no trae la lista, y leerla no puede romperse por eso.
  it("returns an empty string for a sale with no returns", () => {
    expect(formatReturnItems(undefined)).toBe("");
    expect(formatReturnItems([])).toBe("");
  });
});
