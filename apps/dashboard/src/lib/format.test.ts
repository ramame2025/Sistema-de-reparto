import type { SaleRecord } from "@distribuidor/shared";
import { formatPaymentMethod } from "./format";

const buildChurnSale = (): SaleRecord => ({
  id: "sale-1",
  createdAt: new Date().toISOString(),
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
