import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import useSWR from "swr";
import { useApiClient } from "../../../context/AuthContext";
import { ApiError } from "../../../lib/api-client";
import ProductosPage from "./page";

jest.mock("swr", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("../../../context/AuthContext", () => ({
  useApiClient: jest.fn(),
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
    isActive: false,
    sortOrder: 1,
    createdAt: "",
    updatedAt: "",
  },
];

const PRICE_TABLE = {
  final: { G10: 8500, G45: 39000 },
  comercio: { G10: 8200, G45: 38000 },
  distribuidor: { G10: 7900, G45: 36500 },
};

describe("ProductosPage", () => {
  const post = jest.fn();
  const patch = jest.fn();
  const put = jest.fn();
  const mutate = jest.fn();

  beforeEach(() => {
    post.mockReset().mockResolvedValue({});
    patch.mockReset().mockResolvedValue({});
    put.mockReset().mockResolvedValue({});
    mutate.mockReset();
    mockedUseApiClient.mockReturnValue({ post, patch, put });
    mockedUseSWR.mockImplementation((key: string) => ({
      data: key === "/products?includeInactive=true" ? PRODUCTS : PRICE_TABLE,
      isLoading: false,
      error: undefined,
      mutate,
    }));
  });

  // El nombre se edita en la misma fila, asi que vive en un input, no en un
  // nodo de texto.
  it("lists every product, including the deactivated ones", () => {
    render(<ProductosPage />);

    expect(screen.getByText("G10")).toBeInTheDocument();
    expect(screen.getByTestId("name-p2")).toHaveValue("Garrafa 45kg");
  });

  it("shows the current price of each product for the three customer types", () => {
    render(<ProductosPage />);

    expect(screen.getByTestId("price-G10-final")).toHaveValue(8500);
    expect(screen.getByTestId("price-G10-comercio")).toHaveValue(8200);
    expect(screen.getByTestId("price-G10-distribuidor")).toHaveValue(7900);
  });

  it("marks which products are deactivated", () => {
    render(<ProductosPage />);

    expect(screen.getByTestId("status-p2")).toHaveTextContent("de baja");
    expect(screen.getByTestId("status-p1")).toHaveTextContent("activo");
  });

  describe("creating a product", () => {
    const fillNewProduct = () => {
      fireEvent.change(screen.getByLabelText("Codigo"), { target: { value: "G20" } });
      fireEvent.change(screen.getByLabelText("Nombre"), {
        target: { value: "Garrafa 20kg" },
      });
      fireEvent.change(screen.getByLabelText("Precio final"), {
        target: { value: "20000" },
      });
      fireEvent.change(screen.getByLabelText("Precio comercio"), {
        target: { value: "19000" },
      });
      fireEvent.change(screen.getByLabelText("Precio distribuidor"), {
        target: { value: "18000" },
      });
    };

    it("sends the product with its three prices in a single request", async () => {
      render(<ProductosPage />);

      fillNewProduct();
      fireEvent.click(screen.getByRole("button", { name: "Crear producto" }));

      await waitFor(() => expect(post).toHaveBeenCalled());
      expect(post).toHaveBeenCalledWith("/products", {
        code: "G20",
        name: "Garrafa 20kg",
        sortOrder: 2,
        prices: { final: 20000, comercio: 19000, distribuidor: 18000 },
      });
    });

    // El codigo viaja dentro de las ventas encoladas en los telefonos y es
    // inmutable, asi que se normaliza antes de crearlo y no despues.
    it("uppercases the code before sending it", async () => {
      render(<ProductosPage />);

      fillNewProduct();
      fireEvent.change(screen.getByLabelText("Codigo"), { target: { value: "g20" } });
      fireEvent.click(screen.getByRole("button", { name: "Crear producto" }));

      await waitFor(() => expect(post).toHaveBeenCalled());
      expect(post.mock.calls[0][1].code).toBe("G20");
    });

    // Un producto sin sus tres precios rompe getPriceTable y con ella TODAS
    // las ventas, asi que el boton no se habilita hasta tenerlos.
    it("keeps the button disabled until code, name and the three prices are filled", () => {
      render(<ProductosPage />);
      const submit = screen.getByRole("button", { name: "Crear producto" });

      expect(submit).toBeDisabled();
      fireEvent.change(screen.getByLabelText("Codigo"), { target: { value: "G20" } });
      fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Nueva" } });
      expect(submit).toBeDisabled();
      fireEvent.change(screen.getByLabelText("Precio final"), {
        target: { value: "1" },
      });
      fireEvent.change(screen.getByLabelText("Precio comercio"), {
        target: { value: "1" },
      });
      expect(submit).toBeDisabled();
      fireEvent.change(screen.getByLabelText("Precio distribuidor"), {
        target: { value: "1" },
      });
      expect(submit).toBeEnabled();
    });

    it("names the conflicting code when the API rejects a duplicate", async () => {
      post.mockRejectedValueOnce(new ApiError(409));
      render(<ProductosPage />);

      fillNewProduct();
      fireEvent.click(screen.getByRole("button", { name: "Crear producto" }));

      expect(await screen.findByTestId("products-error")).toHaveTextContent("G20");
    });
  });

  describe("editing a product", () => {
    it("renames a product without touching its code", async () => {
      render(<ProductosPage />);

      fireEvent.change(screen.getByTestId("name-p1"), {
        target: { value: "Garrafa 10kg" },
      });
      fireEvent.click(screen.getByTestId("save-p1"));

      await waitFor(() => expect(patch).toHaveBeenCalled());
      expect(patch).toHaveBeenCalledWith("/products/p1", { name: "Garrafa 10kg" });
      expect(patch.mock.calls[0][1]).not.toHaveProperty("code");
    });

    it("deactivates a product after confirmation", async () => {
      jest.spyOn(window, "confirm").mockReturnValue(true);
      render(<ProductosPage />);

      fireEvent.click(screen.getByTestId("toggle-active-p1"));

      await waitFor(() =>
        expect(patch).toHaveBeenCalledWith("/products/p1", { isActive: false }),
      );
    });

    it("reactivates a deactivated product without asking", async () => {
      render(<ProductosPage />);

      fireEvent.click(screen.getByTestId("toggle-active-p2"));

      await waitFor(() =>
        expect(patch).toHaveBeenCalledWith("/products/p2", { isActive: true }),
      );
    });

    it("sends nothing when saving a row that was not changed", async () => {
      render(<ProductosPage />);

      fireEvent.click(screen.getByTestId("save-p1"));

      await waitFor(() => expect(mutate).not.toHaveBeenCalled());
      expect(patch).not.toHaveBeenCalled();
      expect(put).not.toHaveBeenCalled();
    });
  });

  describe("editing prices", () => {
    it("sends only the prices that changed", async () => {
      render(<ProductosPage />);

      fireEvent.change(screen.getByTestId("price-G10-final"), {
        target: { value: "12000" },
      });
      fireEvent.click(screen.getByTestId("save-p1"));

      await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
      expect(put).toHaveBeenCalledWith("/prices/G10/final", { amount: 12000 });
    });

    it("can change all three at once", async () => {
      render(<ProductosPage />);

      fireEvent.change(screen.getByTestId("price-G10-final"), {
        target: { value: "1" },
      });
      fireEvent.change(screen.getByTestId("price-G10-comercio"), {
        target: { value: "2" },
      });
      fireEvent.change(screen.getByTestId("price-G10-distribuidor"), {
        target: { value: "3" },
      });
      fireEvent.click(screen.getByTestId("save-p1"));

      await waitFor(() => expect(put).toHaveBeenCalledTimes(3));
    });

    // El chofer trae los precios al abrir la app o al sincronizar, asi que un
    // cambio no le llega al instante. Decirselo evita el reclamo de "puse el
    // precio nuevo y el chofer cobro el viejo".
    it("warns that drivers only pick up a new price after they sync", async () => {
      render(<ProductosPage />);

      fireEvent.change(screen.getByTestId("price-G10-final"), {
        target: { value: "12000" },
      });
      fireEvent.click(screen.getByTestId("save-p1"));

      expect(await screen.findByTestId("products-notice")).toHaveTextContent(
        /sincronic/i,
      );
    });
  });

  it("shows an empty state when there are no products", () => {
    mockedUseSWR.mockImplementation((key: string) => ({
      data: key === "/products?includeInactive=true" ? [] : PRICE_TABLE,
      isLoading: false,
      error: undefined,
      mutate,
    }));
    render(<ProductosPage />);

    expect(screen.getByTestId("products-empty")).toBeInTheDocument();
  });
});
