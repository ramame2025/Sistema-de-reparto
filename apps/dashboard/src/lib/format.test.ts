import type { SaleRecord } from "@distribuidor/shared";
import { formatPaymentMethod, formatTruckCapacities } from "./format";

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
