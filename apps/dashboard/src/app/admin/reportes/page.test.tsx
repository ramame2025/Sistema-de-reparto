import { fireEvent, render, screen } from "@testing-library/react";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import { useApiClient, useAuth } from "../../../context/AuthContext";
import ReportesPage from "./page";

jest.mock("swr", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useSearchParams: jest.fn(),
}));

jest.mock("../../../context/AuthContext", () => ({
  useApiClient: jest.fn(),
  useAuth: jest.fn(),
}));

const mockedUseSWR = useSWR as unknown as jest.Mock;
const mockedUseSearchParams = useSearchParams as unknown as jest.Mock;
const mockedUseApiClient = useApiClient as unknown as jest.Mock;
const mockedUseAuth = useAuth as unknown as jest.Mock;

// Dentro de la ventana por defecto (ultima semana): con una fecha fija vieja,
// el filtro de fechas por defecto las esconderia y no habria filas que abrir.
const NOW_ISO = new Date().toISOString();

const baseSale = {
  id: "sale-1",
  createdAt: NOW_ISO,
  occurredAt: NOW_ISO,
  status: "active" as const,
  driverName: "chofer1",
  truckCode: "CAMION-01",
  total: 13000,
  customerName: "Kiosco Sur",
  customerType: "final" as const,
  paymentMethod: "transferencia" as const,
  items: [],
  kind: "sale" as const,
};

const makeSales = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ ...baseSale, id: `sale-${i + 1}` }));

const baseExpense = {
  id: "exp-1",
  createdAt: NOW_ISO,
  driverName: "chofer1",
  category: "combustible" as const,
  amount: 5000,
  note: "carga",
};

const makeExpenses = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ ...baseExpense, id: `exp-${i + 1}` }));

const renderTab = (tab: string, data: { sales?: unknown[]; expenses?: unknown[] }) => {
  mockedUseSearchParams.mockReturnValue({
    get: (key: string) => (key === "tab" ? tab : null),
  });
  mockedUseSWR.mockImplementation((key: string | null) => {
    if (key === "/sales") {
      return { data: data.sales ?? [], isLoading: false, error: undefined, mutate: jest.fn() };
    }
    if (key === "/expenses") {
      return { data: data.expenses ?? [], isLoading: false, error: undefined, mutate: jest.fn() };
    }
    return { data: [], isLoading: false, error: undefined, mutate: jest.fn() };
  });
  render(<ReportesPage />);
};

const bodyRowCount = () => screen.getAllByRole("row").length - 1; // menos el thead

const pad2 = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const renderWithSales = (sales: unknown[]) => {
  mockedUseSWR.mockImplementation((key: string | null) => {
    if (key === "/sales") {
      return { data: sales, isLoading: false, error: undefined, mutate: jest.fn() };
    }
    return { data: [], isLoading: false, error: undefined, mutate: jest.fn() };
  });
  render(<ReportesPage />);
};

const openFirstSale = () => {
  fireEvent.click(screen.getAllByRole("button", { name: "Ver" })[0]);
};

describe("ReportesPage · comprobante de pago de una venta", () => {
  beforeEach(() => {
    mockedUseSWR.mockReset();
    mockedUseSearchParams.mockReturnValue({ get: () => null });
    mockedUseApiClient.mockReturnValue({ patch: jest.fn() });
    mockedUseAuth.mockReturnValue({ token: "tok" });
  });

  it("shows the uploaded proof image and a link when the sale has one", () => {
    renderWithSales([{ ...baseSale, paymentProofRef: "/uploads/proof-1.jpg" }]);

    openFirstSale();

    const image = screen.getByAltText("Comprobante de pago") as HTMLImageElement;
    expect(image).toBeInTheDocument();
    expect(image.src).toContain("/uploads/proof-1.jpg");

    const link = image.closest("a") as HTMLAnchorElement;
    expect(link).toHaveAttribute("href", expect.stringContaining("/uploads/proof-1.jpg"));
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("resolves an absolute proof URL as-is", () => {
    renderWithSales([
      { ...baseSale, paymentProofRef: "https://cdn.example.com/p/abc.jpg" },
    ]);

    openFirstSale();

    expect((screen.getByAltText("Comprobante de pago") as HTMLImageElement).src).toBe(
      "https://cdn.example.com/p/abc.jpg",
    );
  });

  it.each(["transferencia", "qr", "tarjeta"] as const)(
    "shows the proof regardless of the non-cash method (%s)",
    (paymentMethod) => {
      renderWithSales([
        { ...baseSale, paymentMethod, paymentProofRef: `/uploads/${paymentMethod}.jpg` },
      ]);

      openFirstSale();

      expect(
        (screen.getByAltText("Comprobante de pago") as HTMLImageElement).src,
      ).toContain(`/uploads/${paymentMethod}.jpg`);
    },
  );

  it("notes when a non-cash sale has no proof attached", () => {
    renderWithSales([{ ...baseSale, paymentMethod: "transferencia" }]);

    openFirstSale();

    expect(screen.queryByAltText("Comprobante de pago")).not.toBeInTheDocument();
    expect(
      screen.getByText(/no adjunto comprobante para esta venta/i),
    ).toBeInTheDocument();
  });

  it("marks the proof as not applicable for a cash sale", () => {
    renderWithSales([{ ...baseSale, paymentMethod: "efectivo" }]);

    openFirstSale();

    expect(screen.getByText(/no aplica/i)).toBeInTheDocument();
  });
});

describe("ReportesPage · filtro de fechas y paginacion", () => {
  beforeEach(() => {
    mockedUseSWR.mockReset();
    mockedUseSearchParams.mockReturnValue({ get: () => null });
    mockedUseApiClient.mockReturnValue({ patch: jest.fn() });
    mockedUseAuth.mockReturnValue({ token: "tok" });
  });

  it("defaults both date ranges to the last week", () => {
    renderWithSales([]);

    const today = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    for (const input of screen.getAllByLabelText("Fecha desde")) {
      expect((input as HTMLInputElement).value).toBe(isoDate(weekAgo));
    }
    for (const input of screen.getAllByLabelText("Fecha hasta")) {
      expect((input as HTMLInputElement).value).toBe(isoDate(today));
    }
  });

  it("shows at most 15 rows per page and pages through the rest", () => {
    renderWithSales(makeSales(20));

    expect(screen.getAllByRole("button", { name: "Ver" })).toHaveLength(15);
    expect(screen.getByText(/P[aá]gina 1 de 2 \(20 ventas\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    expect(screen.getAllByRole("button", { name: "Ver" })).toHaveLength(5);
    expect(screen.getByText(/P[aá]gina 2 de 2/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(screen.getAllByRole("button", { name: "Ver" })).toHaveLength(15);
  });

  it("returns to page 1 when a filter changes", () => {
    renderWithSales(makeSales(20));

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByText(/P[aá]gina 2 de 2/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "active" } });

    expect(screen.getByText(/P[aá]gina 1 de 2/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Ver" })).toHaveLength(15);
  });

  it("keeps the pager inert when everything fits on one page", () => {
    renderWithSales(makeSales(15));

    expect(screen.getAllByRole("button", { name: "Ver" })).toHaveLength(15);
    expect(screen.getByText(/P[aá]gina 1 de 1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
  });

  it("applies the same 15-per-page pagination on the gastos tab", () => {
    renderTab("gastos", { expenses: makeExpenses(20) });

    expect(bodyRowCount()).toBe(15);
    expect(screen.getByText(/P[aá]gina 1 de 2 \(20 gastos\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    expect(bodyRowCount()).toBe(5);
    expect(screen.getByText(/P[aá]gina 2 de 2/)).toBeInTheDocument();
  });

  it("resets the gastos page to 1 when a gastos filter changes", () => {
    renderTab("gastos", { expenses: makeExpenses(20) });

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByText(/P[aá]gina 2 de 2/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Categoria"), {
      target: { value: "combustible" },
    });

    expect(screen.getByText(/P[aá]gina 1 de 2/)).toBeInTheDocument();
    expect(bodyRowCount()).toBe(15);
  });
});
