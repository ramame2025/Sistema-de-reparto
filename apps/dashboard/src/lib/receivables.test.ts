import { UNIDENTIFIED_CUSTOMER_KEY, summarizeReceivables } from "./receivables";
import type { PaymentMethodRecord, SaleRecord } from "@distribuidor/shared";

const sale = (overrides: Partial<SaleRecord> = {}): SaleRecord =>
  ({
    id: "s-1",
    createdAt: "2026-09-10T14:00:00.000Z",
    occurredAt: "2026-09-10T14:00:00.000Z",
    status: "active",
    driverName: "juan",
    total: 1000,
    customerName: "Kiosco Sur",
    customerId: "c-1",
    customerType: "final",
    paymentMethod: "cuenta_corriente",
    items: [],
    kind: "sale",
    ...overrides,
  }) as SaleRecord;

const method = (overrides: Partial<PaymentMethodRecord> = {}): PaymentMethodRecord =>
  ({
    id: "pm-1",
    code: "cuenta_corriente",
    name: "Cuenta corriente",
    isActive: true,
    sortOrder: 4,
    proofPolicy: "none",
    countsAsCash: false,
    createsDebt: true,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  }) as PaymentMethodRecord;

const CATALOG: PaymentMethodRecord[] = [
  method({ id: "pm-0", code: "efectivo", name: "Efectivo", sortOrder: 1, countsAsCash: true, createsDebt: false }),
  method(),
];

describe("summarizeReceivables", () => {
  it("agrupa por cliente y suma lo vendido a cuenta", () => {
    const result = summarizeReceivables(
      [
        sale({ id: "s-1", total: 1000 }),
        sale({ id: "s-2", total: 500 }),
        sale({ id: "s-3", total: 700, customerId: "c-2", customerName: "Almacen Norte" }),
      ],
      CATALOG,
    );

    expect(result.totalSoldOnAccount).toBe(2200);
    expect(result.salesCount).toBe(3);
    expect(result.groups).toEqual([
      {
        customerId: "c-1",
        customerName: "Kiosco Sur",
        soldOnAccount: 1500,
        salesCount: 2,
        identified: true,
      },
      {
        customerId: "c-2",
        customerName: "Almacen Norte",
        soldOnAccount: 700,
        salesCount: 1,
        identified: true,
      },
    ]);
  });

  it("no cuenta una venta anulada: una venta anulada no es deuda", () => {
    const result = summarizeReceivables(
      [sale({ id: "s-1", total: 1000 }), sale({ id: "s-2", total: 9999, status: "canceled" })],
      CATALOG,
    );

    expect(result.totalSoldOnAccount).toBe(1000);
    expect(result.salesCount).toBe(1);
    expect(result.groups).toHaveLength(1);
  });

  it("deja afuera un medio de pago que no genera deuda", () => {
    const result = summarizeReceivables(
      [sale({ id: "s-1", total: 1000, paymentMethod: "efectivo" })],
      CATALOG,
    );

    expect(result.totalSoldOnAccount).toBe(0);
    expect(result.groups).toEqual([]);
  });

  it("D2: entra cualquier medio con createsDebt, no solo 'cuenta_corriente'", () => {
    const catalog = [
      ...CATALOG,
      method({ id: "pm-9", code: "fiado_30_dias", name: "Fiado a 30 dias", sortOrder: 5 }),
    ];

    const result = summarizeReceivables(
      [sale({ id: "s-1", total: 400, paymentMethod: "fiado_30_dias" as SaleRecord["paymentMethod"] })],
      catalog,
    );

    expect(result.totalSoldOnAccount).toBe(400);
    expect(result.groups[0]).toMatchObject({ customerId: "c-1", soldOnAccount: 400 });
  });

  it("junta las ventas sin cliente identificado en un grupo aparte y las cuenta", () => {
    const result = summarizeReceivables(
      [
        sale({ id: "s-1", total: 1000 }),
        sale({ id: "s-2", total: 300, customerId: undefined, customerName: "Anotado a mano" }),
        sale({ id: "s-3", total: 200, customerId: "   ", customerName: "Otro sin padron" }),
      ],
      CATALOG,
    );

    expect(result.totalSoldOnAccount).toBe(1500);
    expect(result.unidentifiedCount).toBe(2);

    const unidentified = result.groups.find((group) => !group.identified);
    expect(unidentified).toEqual({
      customerId: null,
      customerName: UNIDENTIFIED_CUSTOMER_KEY,
      soldOnAccount: 500,
      salesCount: 2,
      identified: false,
    });
  });

  it("deja el grupo sin identificar al final, aunque deba mas que los demas", () => {
    const result = summarizeReceivables(
      [
        sale({ id: "s-1", total: 100 }),
        sale({ id: "s-2", total: 9000, customerId: undefined, customerName: "Sin padron" }),
      ],
      CATALOG,
    );

    expect(result.groups.map((group) => group.identified)).toEqual([true, false]);
  });

  it("no cuenta nada con el catalogo vacio: sin catalogo no se sabe que medio deja deuda", () => {
    const result = summarizeReceivables([sale({ id: "s-1", total: 1000 })], []);

    expect(result.totalSoldOnAccount).toBe(0);
    expect(result.groups).toEqual([]);
    expect(result.unidentifiedCount).toBe(0);
  });

  it("no cuenta una venta cuyo medio no esta en el catalogo", () => {
    const result = summarizeReceivables(
      [sale({ id: "s-1", total: 1000, paymentMethod: "medio_borrado" as SaleRecord["paymentMethod"] })],
      CATALOG,
    );

    expect(result.totalSoldOnAccount).toBe(0);
    expect(result.groups).toEqual([]);
  });

  it("ignora una fila de churn, que se persiste sin medio de pago", () => {
    const result = summarizeReceivables(
      [sale({ id: "s-1", total: 0, kind: "churn", paymentMethod: null })],
      CATALOG,
    );

    expect(result.groups).toEqual([]);
  });

  it("devuelve ceros con un dataset vacio en vez de NaN", () => {
    expect(summarizeReceivables([], CATALOG)).toEqual({
      groups: [],
      totalSoldOnAccount: 0,
      salesCount: 0,
      unidentifiedCount: 0,
    });
  });

  it("usa el nombre mas reciente del cliente del padron, no el de la primera venta", () => {
    const result = summarizeReceivables(
      [
        sale({ id: "s-1", total: 100, createdAt: "2026-09-01T10:00:00.000Z", customerName: "Kiosco Sur" }),
        sale({ id: "s-2", total: 100, createdAt: "2026-09-09T10:00:00.000Z", customerName: "Kiosco Sur SRL" }),
      ],
      CATALOG,
    );

    expect(result.groups[0].customerName).toBe("Kiosco Sur SRL");
  });
});
