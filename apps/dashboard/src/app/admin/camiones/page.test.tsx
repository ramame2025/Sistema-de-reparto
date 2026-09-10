import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import useSWR from "swr";
import { useApiClient } from "../../../context/AuthContext";
import CamionesPage from "./page";

jest.mock("swr", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("../../../context/AuthContext", () => ({
  useApiClient: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const mockedUseSWR = useSWR as unknown as jest.Mock;
const mockedUseApiClient = useApiClient as unknown as jest.Mock;

const PRODUCTS = [
  {
    id: "p1",
    code: "G10",
    name: "G10",
    isActive: true,
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "p2",
    code: "G45",
    name: "Garrafa 45kg",
    isActive: true,
    sortOrder: 1,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "p3",
    code: "G15_VIEJO",
    name: "Garrafa vieja",
    isActive: false,
    sortOrder: 2,
    createdAt: "",
    updatedAt: "",
  },
];

const TRUCKS = [
  {
    id: "truck-1",
    code: "T-01",
    plate: "AB123CD",
    capacities: [{ productCode: "G10", units: 30 }],
    isActive: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "truck-2",
    code: "T-02",
    plate: "XY987ZW",
    capacities: [],
    isActive: true,
    createdAt: "",
    updatedAt: "",
  },
];

function swrByKey(trucks: unknown = TRUCKS, products: unknown = PRODUCTS) {
  return (key: string) => {
    if (key.startsWith("/products")) return products;
    return trucks;
  };
}

describe("CamionesPage", () => {
  const post = jest.fn();
  const patch = jest.fn();
  const put = jest.fn();
  const mutate = jest.fn();

  const mockData = (byKey: (key: string) => unknown) => {
    mockedUseSWR.mockImplementation((key: string) => ({
      data: byKey(key),
      isLoading: false,
      error: undefined,
      mutate,
    }));
  };

  beforeEach(() => {
    post.mockReset().mockResolvedValue({});
    patch.mockReset().mockResolvedValue({});
    put.mockReset().mockResolvedValue({});
    mutate.mockReset();
    mockedUseApiClient.mockReturnValue({ post, patch, put });
    mockData(swrByKey());
  });

  describe("the capacity column", () => {
    it("shows the per-product grid a truck already has", () => {
      render(<CamionesPage />);

      expect(screen.getByTestId("capacity-truck-1")).toHaveTextContent("G10 30");
    });

    // Nunca 0: un camion sin grilla no es un camion que no carga nada, es uno
    // que nadie detallo todavia.
    it("reads 'sin detallar' for a truck with an empty grid", () => {
      render(<CamionesPage />);

      expect(screen.getByTestId("capacity-truck-2")).toHaveTextContent("sin detallar");
    });
  });

  describe("editing the capacity grid", () => {
    it("offers one row per ACTIVE product, and none for a retired one", () => {
      render(<CamionesPage />);

      fireEvent.click(screen.getByTestId("edit-capacity-truck-1"));

      expect(screen.getByTestId("capacity-input-truck-1-G10")).toBeInTheDocument();
      expect(screen.getByTestId("capacity-input-truck-1-G45")).toBeInTheDocument();
      expect(screen.queryByTestId("capacity-input-truck-1-G15_VIEJO")).toBeNull();
    });

    it("loads the editor with the units the truck already has", () => {
      render(<CamionesPage />);

      fireEvent.click(screen.getByTestId("edit-capacity-truck-1"));

      expect(screen.getByTestId("capacity-input-truck-1-G10")).toHaveValue(30);
      // Sin fila cargada el campo queda vacio, no en 0.
      expect(screen.getByTestId("capacity-input-truck-1-G45")).toHaveValue(null);
    });

    it("replaces the whole grid with a single PUT", async () => {
      render(<CamionesPage />);

      fireEvent.click(screen.getByTestId("edit-capacity-truck-1"));
      fireEvent.change(screen.getByTestId("capacity-input-truck-1-G45"), {
        target: { value: "12" },
      });
      fireEvent.click(screen.getByTestId("save-capacity-truck-1"));

      await waitFor(() => expect(put).toHaveBeenCalled());
      expect(put).toHaveBeenCalledWith("/trucks/truck-1/capacities", {
        capacities: [
          { productCode: "G10", units: 30 },
          { productCode: "G45", units: 12 },
        ],
      });
    });

    // 0 es una respuesta real y se manda; el campo en blanco no es ninguna
    // respuesta y no viaja como fila.
    it("sends a 0 as a real row and omits a blank field entirely", async () => {
      render(<CamionesPage />);

      fireEvent.click(screen.getByTestId("edit-capacity-truck-2"));
      fireEvent.change(screen.getByTestId("capacity-input-truck-2-G10"), {
        target: { value: "0" },
      });
      fireEvent.click(screen.getByTestId("save-capacity-truck-2"));

      await waitFor(() => expect(put).toHaveBeenCalled());
      expect(put).toHaveBeenCalledWith("/trucks/truck-2/capacities", {
        capacities: [{ productCode: "G10", units: 0 }],
      });
    });

    it("rejects a negative value without calling the API", async () => {
      render(<CamionesPage />);

      fireEvent.click(screen.getByTestId("edit-capacity-truck-1"));
      fireEvent.change(screen.getByTestId("capacity-input-truck-1-G10"), {
        target: { value: "-1" },
      });
      fireEvent.click(screen.getByTestId("save-capacity-truck-1"));

      await waitFor(() =>
        expect(screen.getByText(/entero no negativo/i)).toBeInTheDocument(),
      );
      expect(put).not.toHaveBeenCalled();
    });
  });

  describe("creating a truck", () => {
    // La capacidad dejo de cargarse junto al codigo y la patente: es una
    // grilla, y se completa despues.
    it("sends only code and plate", async () => {
      render(<CamionesPage />);

      fireEvent.change(screen.getByTestId("new-truck-code"), {
        target: { value: "T-09" },
      });
      fireEvent.change(screen.getByTestId("new-truck-plate"), {
        target: { value: "ZZ999ZZ" },
      });
      fireEvent.click(screen.getByTestId("create-truck"));

      await waitFor(() => expect(post).toHaveBeenCalled());
      expect(post).toHaveBeenCalledWith("/trucks", {
        code: "T-09",
        plate: "ZZ999ZZ",
      });
    });
  });
});
