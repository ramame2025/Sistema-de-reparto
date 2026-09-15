import { render, screen } from "@testing-library/react";
import useSWR from "swr";
import CuentasPorCobrarPage from "./page";

jest.mock("swr", () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockedUseSWR = useSWR as unknown as jest.Mock;

const PAYMENT_METHODS = [
  {
    id: "pm-0",
    code: "efectivo",
    name: "Efectivo",
    isActive: true,
    sortOrder: 1,
    proofPolicy: "none",
    countsAsCash: true,
    createsDebt: false,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "pm-1",
    code: "cuenta_corriente",
    name: "Cuenta corriente",
    isActive: true,
    sortOrder: 4,
    proofPolicy: "none",
    countsAsCash: false,
    createsDebt: true,
    createdAt: "",
    updatedAt: "",
  },
];

const SALES = [
  {
    id: "s-1",
    createdAt: "2026-09-10T14:00:00.000Z",
    occurredAt: "2026-09-10T14:00:00.000Z",
    status: "active",
    driverName: "chofer1",
    total: 12000,
    customerName: "Kiosco Sur",
    customerId: "c-1",
    customerType: "final",
    paymentMethod: "cuenta_corriente",
    items: [],
    kind: "sale",
  },
  {
    id: "s-2",
    createdAt: "2026-09-11T14:00:00.000Z",
    occurredAt: "2026-09-11T14:00:00.000Z",
    status: "active",
    driverName: "chofer1",
    total: 5000,
    customerName: "Pago al contado",
    customerId: "c-2",
    customerType: "final",
    paymentMethod: "efectivo",
    items: [],
    kind: "sale",
  },
];

const renderPage = (sales: unknown[] = SALES) => {
  mockedUseSWR.mockImplementation((key: string | null) => {
    if (key === "/sales") {
      return { data: sales, isLoading: false, error: undefined };
    }
    if (key === "/payment-methods?includeInactive=true") {
      return { data: PAYMENT_METHODS, isLoading: false, error: undefined };
    }
    return { data: [], isLoading: false, error: undefined };
  });

  render(<CuentasPorCobrarPage />);
};

describe("CuentasPorCobrarPage", () => {
  beforeEach(() => {
    mockedUseSWR.mockReset();
  });

  it("dice en la pagina, no en un tooltip, que la cifra no es el saldo", () => {
    renderPage();

    expect(
      screen.getByText(
        /Este total es lo VENDIDO a cuenta, no el saldo actual del cliente\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Los cobros todavia no estan implementados/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/coinciden solo hasta el primer cobro/),
    ).toBeInTheDocument();
  });

  it("titula la columna 'Vendido a cuenta' y nunca 'Saldo' ni 'Debe'", () => {
    renderPage();

    expect(screen.getByRole("columnheader", { name: "Vendido a cuenta" })).toBeInTheDocument();
    expect(screen.queryByText(/^Saldo/)).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /Debe/ })).not.toBeInTheDocument();
  });

  it("muestra solo el cliente con ventas a cuenta, no el que pago en efectivo", () => {
    renderPage();

    expect(screen.getByText("Kiosco Sur")).toBeInTheDocument();
    expect(screen.queryByText("Pago al contado")).not.toBeInTheDocument();
    // Dos veces: el total de arriba y la fila del unico cliente a cuenta. La
    // venta en efectivo de $5.000 no suma en ninguno de los dos.
    expect(screen.getAllByText("$12.000")).toHaveLength(2);
  });

  it("nombra los medios que dejan deuda leyendo la bandera, no el codigo", () => {
    renderPage();

    expect(
      screen.getByText(/deja deuda: Cuenta corriente\./),
    ).toBeInTheDocument();
  });

  it("avisa cuando hay ventas a cuenta sin cliente del padron", () => {
    renderPage([
      { ...SALES[0], id: "s-3", customerId: undefined, customerName: "Anotado a mano" },
    ]);

    expect(
      screen.getByText(/1 ventas a cuenta sin cliente del\s+padron/),
    ).toBeInTheDocument();
    expect(screen.getByText("Sin cliente identificado")).toBeInTheDocument();
  });

  it("no inventa un aviso de clientes sin padron cuando estan todos identificados", () => {
    renderPage();

    expect(screen.queryByText(/sin cliente del/)).not.toBeInTheDocument();
  });
});
