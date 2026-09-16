import { fireEvent, render, screen } from "@testing-library/react";
import useSWR from "swr";
import DevolucionesPage from "./page";

jest.mock("swr", () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockedUseSWR = useSWR as unknown as jest.Mock;

const PRODUCTS = [
  {
    id: "p-1",
    code: "G10",
    name: "Garrafa 10kg",
    isActive: true,
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "p-2",
    code: "G15",
    name: "Garrafa 15kg",
    isActive: true,
    sortOrder: 1,
    createdAt: "",
    updatedAt: "",
  },
];

/** Hoy, para caer dentro del rango por defecto de la pantalla. */
const NOW_ISO = new Date().toISOString();

const baseSale = {
  id: "sale-1",
  createdAt: NOW_ISO,
  occurredAt: NOW_ISO,
  status: "active" as const,
  driverName: "chofer1",
  truckCode: "CAMION-01",
  total: 0,
  customerName: "Kiosco Sur",
  customerType: "final" as const,
  paymentMethod: null,
  items: [],
  kind: "churn" as const,
};

const renderWithSales = (sales: unknown[]) => {
  mockedUseSWR.mockImplementation((key: string | null) => {
    if (key === "/sales") {
      return { data: sales, isLoading: false, error: undefined };
    }
    if (key === "/products?includeInactive=true") {
      return { data: PRODUCTS, isLoading: false, error: undefined };
    }
    return { data: [], isLoading: false, error: undefined };
  });

  render(<DevolucionesPage />);
};

describe("DevolucionesPage", () => {
  beforeEach(() => {
    mockedUseSWR.mockReset();
  });

  it("abre por producto Y por motivo, con los dos motivos en columnas distintas", () => {
    renderWithSales([
      {
        ...baseSale,
        returnItems: [
          { productCode: "G10", quantity: 2, reason: "empty" },
          { productCode: "G10", quantity: 1, reason: "faulty" },
          { productCode: "G15", quantity: 3, reason: "empty" },
        ],
      },
    ]);

    expect(
      screen.getByRole("columnheader", { name: "Envases vacios" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Unidades falladas" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Garrafa 10kg" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Garrafa 15kg" })).toBeInTheDocument();
  });

  // El nombre del producto, no su codigo: "G10" no lo lee nadie de memoria.
  it("muestra el nombre del producto y deja el codigo como respaldo", () => {
    renderWithSales([
      {
        ...baseSale,
        returnItems: [{ productCode: "XYZ", quantity: 1, reason: "empty" }],
      },
    ]);

    expect(screen.getByRole("cell", { name: "XYZ" })).toBeInTheDocument();
  });

  it("explica en castellano que es un envase vacio y que es una unidad fallada", () => {
    renderWithSales([]);

    expect(
      screen.getByText(/el cliente devolvio el envase y no se le entrego nada a cambio/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/se retiro una unidad con falla y se entrego una de reemplazo sin cargo/i),
    ).toBeInTheDocument();
  });

  // No inventar mercaderia valorizada: un reemplazo salio con `unitPrice: 0`
  // y ese es su importe real (D5). El reporte cuenta unidades.
  it("dice que cuenta unidades y no plata, y no muestra ningun importe", () => {
    renderWithSales([
      {
        ...baseSale,
        returnItems: [{ productCode: "G10", quantity: 2, reason: "faulty" }],
      },
    ]);

    expect(screen.getByText(/cuenta unidades, no plata/i)).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("deja afuera una venta anulada", () => {
    renderWithSales([
      {
        ...baseSale,
        status: "canceled",
        returnItems: [{ productCode: "G10", quantity: 9, reason: "faulty" }],
      },
    ]);

    expect(screen.getByText(/No volvio nada en el rango elegido/i)).toBeInTheDocument();
  });

  it("no se rompe con ventas viejas sin `returnItems`", () => {
    renderWithSales([{ ...baseSale, kind: "sale", total: 1000, paymentMethod: "efectivo" }]);

    expect(screen.getByText(/No volvio nada en el rango elegido/i)).toBeInTheDocument();
  });

  it("muestra ceros y no NaN cuando el rango no atrapa nada", () => {
    renderWithSales([
      {
        ...baseSale,
        occurredAt: "2020-01-01T10:00:00.000Z",
        createdAt: "2020-01-01T10:00:00.000Z",
        returnItems: [{ productCode: "G10", quantity: 2, reason: "empty" }],
      },
    ]);

    const totals = screen.getByTestId("totales-devoluciones");
    expect(totals).toHaveTextContent("0 envases vacios");
    expect(totals).toHaveTextContent("0 unidades falladas");
    expect(totals.textContent).not.toMatch(/NaN/);
  });

  it("respeta el rango de fechas que elige el admin", () => {
    renderWithSales([
      {
        ...baseSale,
        occurredAt: "2026-09-10T10:00:00.000Z",
        createdAt: "2026-09-10T10:00:00.000Z",
        returnItems: [{ productCode: "G10", quantity: 4, reason: "faulty" }],
      },
    ]);

    fireEvent.change(screen.getByLabelText("Fecha desde"), {
      target: { value: "2026-09-10" },
    });
    fireEvent.change(screen.getByLabelText("Fecha hasta"), {
      target: { value: "2026-09-10" },
    });

    expect(screen.getByTestId("totales-devoluciones")).toHaveTextContent(
      "4 unidades falladas",
    );
  });
});
