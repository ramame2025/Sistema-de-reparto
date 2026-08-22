import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const CUSTOMERS = [
  {
    id: "c1",
    name: "Almacen Norte",
    customerType: "comercio",
    isActive: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "c2",
    name: "Kiosco Sur",
    customerType: "final",
    isActive: true,
    createdAt: "",
    updatedAt: "",
  },
];

const emptySWR = { data: undefined, isLoading: false, error: undefined };

describe("ClientesAsignadosPage", () => {
  const put = jest.fn().mockResolvedValue({});

  beforeEach(() => {
    put.mockClear();
    mockedUseApiClient.mockReturnValue({ put });

    mockedUseSWR.mockReset();
    mockedUseSWR.mockImplementation((key: string | null) => {
      if (key === "/users") {
        return { data: DRIVERS, isLoading: false, error: undefined };
      }
      if (key === "/customers") {
        return { data: CUSTOMERS, isLoading: false, error: undefined };
      }
      if (typeof key === "string" && key.startsWith("/driver-customer-assignments?")) {
        return { data: [], isLoading: false, error: undefined };
      }
      return emptySWR;
    });
  });

  it("renders only choferes in the driver select and lists every customer", () => {
    render(<ClientesAsignadosPage />);

    expect(screen.getByLabelText("Chofer")).toBeInTheDocument();
    expect(screen.getByText("Almacen Norte", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Kiosco Sur", { exact: false })).toBeInTheDocument();
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
});
