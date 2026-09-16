import { render, screen } from "@testing-library/react";
import useSWR from "swr";
import DashboardPage from "./page";

jest.mock("swr", () => ({
  __esModule: true,
  default: jest.fn(() => ({ data: [], isLoading: false, error: undefined })),
}));

const mockedUseSWR = useSWR as unknown as jest.Mock;

describe("DashboardPage", () => {
  beforeEach(() => {
    mockedUseSWR.mockClear();
  });

  it("polls /sales and /expenses every 15s: la portada se mantiene viva sin recargar", () => {
    render(<DashboardPage />);

    expect(mockedUseSWR).toHaveBeenCalledWith("/sales", { refreshInterval: 15000 });
    expect(mockedUseSWR).toHaveBeenCalledWith("/expenses", { refreshInterval: 15000 });
  });

  // Pregunta A del plan container-swap.md: un cambio y una devolucion se
  // cuentan aparte de las ventas, y la portada tiene que decirlo.
  it("cuenta las visitas atendidas aparte de las ventas", () => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date());
    const at = `${today}T12:00:00.000Z`;

    mockedUseSWR.mockImplementation((key: string) => {
      if (key === "/sales") {
        return {
          data: [
            {
              id: "s-1",
              createdAt: at,
              occurredAt: at,
              status: "active",
              driverName: "chofer1",
              total: 1000,
              customerName: "Kiosco",
              customerType: "final",
              paymentMethod: "efectivo",
              items: [],
              kind: "sale",
            },
            {
              id: "s-2",
              createdAt: at,
              occurredAt: at,
              status: "active",
              driverName: "chofer1",
              total: 0,
              customerName: "Kiosco",
              customerType: "final",
              paymentMethod: null,
              items: [],
              kind: "swap",
            },
          ],
          isLoading: false,
          error: undefined,
        };
      }
      return { data: [], isLoading: false, error: undefined };
    });

    render(<DashboardPage />);

    expect(screen.getByText("Visitas atendidas hoy")).toBeInTheDocument();
    expect(screen.getByText(/cambios y devoluciones, sin venta/i)).toBeInTheDocument();
    // La venta sigue siendo una sola: el cambio no la infla.
    expect(screen.getByText("1 ventas")).toBeInTheDocument();
  });
});
