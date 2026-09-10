import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import useSWR from "swr";
import { useApiClient } from "../../../context/AuthContext";
import { ApiError } from "../../../lib/api-client";
import CategoriasPage from "./page";

jest.mock("swr", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("../../../context/AuthContext", () => ({
  useApiClient: jest.fn(),
}));

const mockedUseSWR = useSWR as unknown as jest.Mock;
const mockedUseApiClient = useApiClient as unknown as jest.Mock;

const CATEGORIES = [
  {
    id: "c1",
    code: "final",
    name: "Final",
    isActive: true,
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "c2",
    code: "mayorista",
    name: "Mayorista",
    isActive: false,
    sortOrder: 1,
    createdAt: "",
    updatedAt: "",
  },
];

describe("CategoriasPage", () => {
  const post = jest.fn();
  const patch = jest.fn();
  const mutate = jest.fn();

  beforeEach(() => {
    post.mockReset().mockResolvedValue({});
    patch.mockReset().mockResolvedValue({});
    mutate.mockReset();
    mockedUseApiClient.mockReturnValue({ post, patch });
    mockedUseSWR.mockReturnValue({
      data: CATEGORIES,
      isLoading: false,
      error: undefined,
      mutate,
    });
  });

  it("lists every category, including the deactivated ones", () => {
    render(<CategoriasPage />);

    expect(screen.getByText("final")).toBeInTheDocument();
    expect(screen.getByTestId("name-c2")).toHaveValue("Mayorista");
  });

  it("marks which categories are deactivated", () => {
    render(<CategoriasPage />);

    expect(screen.getByTestId("status-c1")).toHaveTextContent("activa");
    expect(screen.getByTestId("status-c2")).toHaveTextContent("de baja");
  });

  describe("creating a category", () => {
    const fillNewCategory = () => {
      fireEvent.change(screen.getByLabelText("Codigo"), {
        target: { value: "distribuidor" },
      });
      fireEvent.change(screen.getByLabelText("Nombre"), {
        target: { value: "Distribuidor" },
      });
    };

    it("sends the new category at the end of the list", async () => {
      render(<CategoriasPage />);

      fillNewCategory();
      fireEvent.click(screen.getByRole("button", { name: "Crear categoria" }));

      await waitFor(() => expect(post).toHaveBeenCalled());
      expect(post).toHaveBeenCalledWith("/customer-categories", {
        code: "distribuidor",
        name: "Distribuidor",
        sortOrder: 2,
      });
    });

    // El codigo es inmutable y viaja dentro de las ventas encoladas, pero a
    // diferencia de zonas y productos NO se pasa a mayusculas: las categorias
    // semilla son minusculas y no se pueden renombrar.
    it("keeps the code exactly as typed, in lowercase", async () => {
      render(<CategoriasPage />);

      fillNewCategory();
      fireEvent.click(screen.getByRole("button", { name: "Crear categoria" }));

      await waitFor(() => expect(post).toHaveBeenCalled());
      expect(post.mock.calls[0][1].code).toBe("distribuidor");
    });

    it("warns that the new category is born with no prices", () => {
      render(<CategoriasPage />);

      expect(screen.getByTestId("categories-price-warning")).toHaveTextContent(
        /sin precios/i,
      );
    });

    it("names the conflicting code when the API rejects a duplicate", async () => {
      post.mockRejectedValueOnce(new ApiError(409));
      render(<CategoriasPage />);

      fillNewCategory();
      fireEvent.click(screen.getByRole("button", { name: "Crear categoria" }));

      expect(await screen.findByTestId("categories-error")).toHaveTextContent(
        "distribuidor",
      );
    });
  });

  describe("editing a category", () => {
    it("renames a category without touching its code", async () => {
      render(<CategoriasPage />);

      fireEvent.change(screen.getByTestId("name-c1"), {
        target: { value: "Consumidor final" },
      });
      fireEvent.click(screen.getByTestId("save-c1"));

      await waitFor(() => expect(patch).toHaveBeenCalled());
      expect(patch).toHaveBeenCalledWith("/customer-categories/c1", {
        name: "Consumidor final",
      });
      expect(patch.mock.calls[0][1]).not.toHaveProperty("code");
    });

    it("reorders a category", async () => {
      render(<CategoriasPage />);

      fireEvent.change(screen.getByTestId("sort-c1"), { target: { value: "5" } });
      fireEvent.click(screen.getByTestId("save-c1"));

      await waitFor(() =>
        expect(patch).toHaveBeenCalledWith("/customer-categories/c1", {
          sortOrder: 5,
        }),
      );
    });

    it("deactivates a category after confirmation", async () => {
      jest.spyOn(window, "confirm").mockReturnValue(true);
      render(<CategoriasPage />);

      fireEvent.click(screen.getByTestId("toggle-active-c1"));

      await waitFor(() =>
        expect(patch).toHaveBeenCalledWith("/customer-categories/c1", {
          isActive: false,
        }),
      );
    });

    it("reactivates a deactivated category without asking", async () => {
      render(<CategoriasPage />);

      fireEvent.click(screen.getByTestId("toggle-active-c2"));

      await waitFor(() =>
        expect(patch).toHaveBeenCalledWith("/customer-categories/c2", {
          isActive: true,
        }),
      );
    });

    it("sends nothing when saving a row that was not changed", async () => {
      render(<CategoriasPage />);

      fireEvent.click(screen.getByTestId("save-c1"));

      await waitFor(() => expect(mutate).not.toHaveBeenCalled());
      expect(patch).not.toHaveBeenCalled();
    });
  });

  it("shows an empty state when there are no categories", () => {
    mockedUseSWR.mockReturnValue({
      data: [],
      isLoading: false,
      error: undefined,
      mutate,
    });
    render(<CategoriasPage />);

    expect(screen.getByTestId("categories-empty")).toBeInTheDocument();
  });
});
