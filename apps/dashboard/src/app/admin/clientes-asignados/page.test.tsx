import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import useSWR from "swr";
import { useApiClient } from "../../../context/AuthContext";
import ClientesAsignadosPage from "./page";

jest.mock("swr", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("../../../context/AuthContext", () => ({
  useApiClient: jest.fn(),
}));

const mockedUseSWR = useSWR as unknown as jest.Mock;
const mockedUseApiClient = useApiClient as unknown as jest.Mock;

const DRIVERS = [
  { id: "d1", username: "chofer1", role: "chofer", createdAt: "", updatedAt: "" },
  { id: "d2", username: "chofer2", role: "chofer", createdAt: "", updatedAt: "" },
  { id: "a1", username: "admin1", role: "admin", createdAt: "", updatedAt: "" },
];

const ZONES = [
  { id: "z1", code: "NORTE", name: "Norte", isActive: true, sortOrder: 0, createdAt: "", updatedAt: "" },
  { id: "z2", code: "SUR", name: "Sur", isActive: true, sortOrder: 1, createdAt: "", updatedAt: "" },
];

const CUSTOMERS = [
  {
    id: "c1",
    name: "Almacen Norte",
    customerType: "comercio",
    zoneId: "z1",
    zone: "Norte",
    isActive: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "c2",
    name: "Kiosco Sur",
    customerType: "final",
    zoneId: "z2",
    zone: "Sur",
    isActive: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "c3",
    name: "Despensa Errante",
    customerType: "final",
    isActive: true,
    createdAt: "",
    updatedAt: "",
  },
];

const emptySWR = { data: undefined, isLoading: false, error: undefined };

const emptyHistory = {
  data: { items: [], page: 1, pageSize: 15, total: 0, totalPages: 1 },
  isLoading: false,
  error: undefined,
};

const isHistoryKey = (key: unknown): boolean =>
  typeof key === "string" && key.startsWith("/driver-customer-assignments/history");

describe("ClientesAsignadosPage", () => {
  const put = jest.fn().mockResolvedValue({});

  beforeEach(() => {
    put.mockClear();
    mockedUseApiClient.mockReturnValue({ put });

    mockedUseSWR.mockReset();
    mockedUseSWR.mockImplementation((key: string | null) => {
      if (typeof key !== "string") {
        return emptySWR;
      }
      if (key === "/users") {
        return { data: DRIVERS, isLoading: false, error: undefined };
      }
      if (key === "/customers") {
        return { data: CUSTOMERS, isLoading: false, error: undefined };
      }
      if (key === "/zones") {
        return { data: ZONES, isLoading: false, error: undefined };
      }
      if (isHistoryKey(key)) {
        return emptyHistory;
      }
      if (key.startsWith("/driver-customer-assignments?")) {
        return { data: [], isLoading: false, error: undefined };
      }
      return emptySWR;
    });
  });

  it("renders only choferes in the driver select and lists every customer", () => {
    render(<ClientesAsignadosPage />);

    expect(screen.getByLabelText("Chofer")).toBeInTheDocument();
    expect(screen.getByLabelText(/Almacen Norte/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Kiosco Sur/)).toBeInTheDocument();
    expect(screen.queryByText("admin1")).not.toBeInTheDocument();
  });

  it("filters the customer list by name via the search box", () => {
    render(<ClientesAsignadosPage />);

    fireEvent.change(screen.getByLabelText("Buscar cliente"), {
      target: { value: "kiosco" },
    });

    expect(screen.queryByLabelText(/Almacen Norte/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Kiosco Sur/)).toBeInTheDocument();
  });

  it("checking customers and saving calls PUT with the checked customer ids", async () => {
    render(<ClientesAsignadosPage />);

    fireEvent.change(screen.getByLabelText("Chofer"), { target: { value: "d1" } });
    fireEvent.click(screen.getByLabelText(/Almacen Norte/));

    fireEvent.click(screen.getByRole("button", { name: /guardar lista/i }));

    await waitFor(() => {
      expect(put).toHaveBeenCalledWith("/driver-customer-assignments", {
        driverId: "d1",
        date: expect.any(String),
        customerIds: ["c1"],
      });
    });
  });

  it("switching driver/date reloads the already-assigned list when it exists", () => {
    mockedUseSWR.mockImplementation((key: string | null) => {
      if (key === "/users") {
        return { data: DRIVERS, isLoading: false, error: undefined };
      }
      if (key === "/customers") {
        return { data: CUSTOMERS, isLoading: false, error: undefined };
      }
      if (key === "/zones") {
        return { data: ZONES, isLoading: false, error: undefined };
      }
      if (key === "/driver-customer-assignments?driverId=d1&date=2026-08-21") {
        return {
          data: [
            {
              id: "asg1",
              driverId: "d1",
              date: "2026-08-21",
              customers: [CUSTOMERS[1]],
              createdAt: "",
              updatedAt: "",
            },
          ],
          isLoading: false,
          error: undefined,
        };
      }
      if (typeof key === "string" && key.startsWith("/driver-customer-assignments?")) {
        return { data: [], isLoading: false, error: undefined };
      }
      return emptySWR;
    });

    render(<ClientesAsignadosPage />);

    fireEvent.change(screen.getByLabelText("Chofer"), { target: { value: "d1" } });
    fireEvent.change(screen.getByLabelText("Dia"), {
      target: { value: "2026-08-21" },
    });

    const kioscoCheckbox = screen.getByLabelText(/Kiosco Sur/) as HTMLInputElement;
    const almacenCheckbox = screen.getByLabelText(/Almacen Norte/) as HTMLInputElement;

    expect(kioscoCheckbox.checked).toBe(true);
    expect(almacenCheckbox.checked).toBe(false);
  });

  it("filters the customer list by zone", () => {
    render(<ClientesAsignadosPage />);

    fireEvent.change(screen.getByLabelText("Zona"), { target: { value: "z1" } });

    expect(screen.getByLabelText(/Almacen Norte/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Kiosco Sur/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Despensa Errante/)).not.toBeInTheDocument();
  });

  it("the 'sin zona' option isolates customers that have no zone assigned", () => {
    render(<ClientesAsignadosPage />);

    fireEvent.change(screen.getByLabelText("Zona"), { target: { value: "__none__" } });

    expect(screen.getByLabelText(/Despensa Errante/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Almacen Norte/)).not.toBeInTheDocument();
  });

  it("checks every visible customer at once without dropping what another zone already checked", async () => {
    render(<ClientesAsignadosPage />);

    fireEvent.change(screen.getByLabelText("Chofer"), { target: { value: "d1" } });

    // Primero una zona, se tilda entera; despues otra. La segunda tanda no
    // puede pisar a la primera: el admin esta sumando zonas al recorrido.
    fireEvent.change(screen.getByLabelText("Zona"), { target: { value: "z1" } });
    fireEvent.click(screen.getByRole("button", { name: /tildar/i }));

    fireEvent.change(screen.getByLabelText("Zona"), { target: { value: "z2" } });
    fireEvent.click(screen.getByRole("button", { name: /tildar/i }));

    fireEvent.click(screen.getByRole("button", { name: /guardar lista/i }));

    await waitFor(() => {
      expect(put).toHaveBeenCalledWith("/driver-customer-assignments", {
        driverId: "d1",
        date: expect.any(String),
        customerIds: ["c1", "c2"],
      });
    });
  });

  it("combines the zone filter with the name search", () => {
    render(<ClientesAsignadosPage />);

    fireEvent.change(screen.getByLabelText("Zona"), { target: { value: "z1" } });
    fireEvent.change(screen.getByLabelText("Buscar cliente"), {
      target: { value: "kiosco" },
    });

    expect(screen.queryByLabelText(/Almacen Norte/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Kiosco Sur/)).not.toBeInTheDocument();
  });

  describe("historial paginado", () => {
    const historyPage = (
      overrides: Partial<{
        items: unknown[];
        page: number;
        total: number;
        totalPages: number;
      }> = {},
    ) => ({
      data: {
        items: [],
        page: 1,
        pageSize: 15,
        total: 0,
        totalPages: 1,
        ...overrides,
      },
      isLoading: false,
      error: undefined,
    });

    const withHistory = (
      resolver: (key: string) => ReturnType<typeof historyPage>,
    ) => {
      mockedUseSWR.mockImplementation((key: string | null) => {
        if (typeof key !== "string") {
          return emptySWR;
        }
        if (key === "/users") {
          return { data: DRIVERS, isLoading: false, error: undefined };
        }
        if (key === "/customers") {
          return { data: CUSTOMERS, isLoading: false, error: undefined };
        }
        if (key === "/zones") {
          return { data: ZONES, isLoading: false, error: undefined };
        }
        if (isHistoryKey(key)) {
          return resolver(key);
        }
        if (key.startsWith("/driver-customer-assignments?")) {
          return { data: [], isLoading: false, error: undefined };
        }
        return emptySWR;
      });
    };

    const lastHistoryKey = () => {
      const keys = mockedUseSWR.mock.calls
        .map((call) => call[0])
        .filter(isHistoryKey);
      return keys[keys.length - 1];
    };

    it("renders one row per assignment with its date, chofer and customers", () => {
      withHistory(() =>
        historyPage({
          items: [
            {
              id: "asg1",
              driverId: "d1",
              date: "2026-08-21",
              customers: [CUSTOMERS[0], CUSTOMERS[1]],
              createdAt: "",
              updatedAt: "",
            },
          ],
          total: 1,
          totalPages: 1,
        }),
      );

      render(<ClientesAsignadosPage />);

      const row = screen.getByText("2026-08-21").closest("tr") as HTMLElement;
      expect(row).toBeInTheDocument();
      expect(within(row).getByText("chofer1")).toBeInTheDocument();
      expect(within(row).getByText(/Almacen Norte/)).toBeInTheDocument();
      expect(within(row).getByText(/Kiosco Sur/)).toBeInTheDocument();
    });

    it("shows an empty-state message when the history has no rows", () => {
      render(<ClientesAsignadosPage />);

      expect(
        screen.getByText(/sin asignaciones en el historial/i),
      ).toBeInTheDocument();
    });

    it("defaults the date range to the last week", () => {
      const pad2 = (n: number) => String(n).padStart(2, "0");
      const iso = (d: Date) =>
        `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      const today = new Date();
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      render(<ClientesAsignadosPage />);

      expect((screen.getByLabelText("Desde") as HTMLInputElement).value).toBe(
        iso(weekAgo),
      );
      expect((screen.getByLabelText("Hasta") as HTMLInputElement).value).toBe(
        iso(today),
      );

      const key = lastHistoryKey() as string;
      expect(key).toContain(`from=${iso(weekAgo)}`);
      expect(key).toContain(`to=${iso(today)}`);
    });

    it("requests the history filtered by chofer, date range and customer", () => {
      render(<ClientesAsignadosPage />);

      fireEvent.change(screen.getByLabelText("Filtrar por chofer"), {
        target: { value: "d2" },
      });
      fireEvent.change(screen.getByLabelText("Desde"), {
        target: { value: "2026-08-01" },
      });
      fireEvent.change(screen.getByLabelText("Hasta"), {
        target: { value: "2026-08-31" },
      });
      fireEvent.change(screen.getByLabelText("Filtrar por cliente"), {
        target: { value: "c2" },
      });

      const key = lastHistoryKey() as string;
      expect(key).toContain("driverId=d2");
      expect(key).toContain("from=2026-08-01");
      expect(key).toContain("to=2026-08-31");
      expect(key).toContain("customerId=c2");
      expect(key).toContain("page=1");
    });

    it("advances and steps back through pages, clamping at the edges", () => {
      withHistory((key) => {
        const page = Number(new URLSearchParams(key.split("?")[1]).get("page"));
        return historyPage({ page, total: 45, totalPages: 3 });
      });

      render(<ClientesAsignadosPage />);

      expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
      expect(lastHistoryKey()).toContain("page=2");

      fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
      expect(lastHistoryKey()).toContain("page=3");
      expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
      expect(lastHistoryKey()).toContain("page=2");
    });

    it("resets to the first page when a filter changes after paging", () => {
      withHistory((key) => {
        const page = Number(new URLSearchParams(key.split("?")[1]).get("page"));
        return historyPage({ page, total: 45, totalPages: 3 });
      });

      render(<ClientesAsignadosPage />);

      fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
      expect(lastHistoryKey()).toContain("page=2");

      fireEvent.change(screen.getByLabelText("Filtrar por chofer"), {
        target: { value: "d1" },
      });
      expect(lastHistoryKey()).toContain("page=1");
    });
  });
});
