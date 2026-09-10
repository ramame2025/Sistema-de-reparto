import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import useSWR from "swr";
import { useApiClient } from "../../../context/AuthContext";
import { ApiError } from "../../../lib/api-client";
import ZonasPage from "./page";

jest.mock("swr", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("../../../context/AuthContext", () => ({
  useApiClient: jest.fn(),
}));

const mockedUseSWR = useSWR as unknown as jest.Mock;
const mockedUseApiClient = useApiClient as unknown as jest.Mock;

const ZONES = [
  {
    id: "z1",
    code: "CENTRO",
    name: "Centro",
    isActive: true,
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "z2",
    code: "ZONA_SUR",
    name: "Sur",
    isActive: false,
    sortOrder: 1,
    createdAt: "",
    updatedAt: "",
  },
];

describe("ZonasPage", () => {
  const post = jest.fn();
  const patch = jest.fn();
  const mutate = jest.fn();

  beforeEach(() => {
    post.mockReset().mockResolvedValue({});
    patch.mockReset().mockResolvedValue({});
    mutate.mockReset();
    mockedUseApiClient.mockReturnValue({ post, patch });
    mockedUseSWR.mockReturnValue({
      data: ZONES,
      isLoading: false,
      error: undefined,
      mutate,
    });
  });

  it("lists every zone, including the deactivated ones", () => {
    render(<ZonasPage />);

    expect(screen.getByText("CENTRO")).toBeInTheDocument();
    expect(screen.getByTestId("name-z2")).toHaveValue("Sur");
  });

  it("marks which zones are deactivated", () => {
    render(<ZonasPage />);

    expect(screen.getByTestId("status-z1")).toHaveTextContent("activa");
    expect(screen.getByTestId("status-z2")).toHaveTextContent("de baja");
  });

  describe("creating a zone", () => {
    const fillNewZone = () => {
      fireEvent.change(screen.getByLabelText("Codigo"), {
        target: { value: "OESTE" },
      });
      fireEvent.change(screen.getByLabelText("Nombre"), {
        target: { value: "Oeste" },
      });
    };

    it("sends the zone at the end of the list", async () => {
      render(<ZonasPage />);

      fillNewZone();
      fireEvent.click(screen.getByRole("button", { name: "Crear zona" }));

      await waitFor(() => expect(post).toHaveBeenCalled());
      expect(post).toHaveBeenCalledWith("/zones", {
        code: "OESTE",
        name: "Oeste",
        sortOrder: 2,
      });
    });

    // El codigo es la clave estable de la zona y no se puede cambiar
    // despues, asi que se normaliza antes de crearla y no despues.
    it("uppercases the code before sending it", async () => {
      render(<ZonasPage />);

      fillNewZone();
      fireEvent.change(screen.getByLabelText("Codigo"), {
        target: { value: "oeste" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Crear zona" }));

      await waitFor(() => expect(post).toHaveBeenCalled());
      expect(post.mock.calls[0][1].code).toBe("OESTE");
    });

    it("keeps the button disabled until code and name are filled", () => {
      render(<ZonasPage />);
      const submit = screen.getByRole("button", { name: "Crear zona" });

      expect(submit).toBeDisabled();
      fireEvent.change(screen.getByLabelText("Codigo"), {
        target: { value: "OESTE" },
      });
      expect(submit).toBeDisabled();
      fireEvent.change(screen.getByLabelText("Nombre"), {
        target: { value: "Oeste" },
      });
      expect(submit).toBeEnabled();
    });

    it("names the conflicting code when the API rejects a duplicate", async () => {
      post.mockRejectedValueOnce(new ApiError(409));
      render(<ZonasPage />);

      fillNewZone();
      fireEvent.click(screen.getByRole("button", { name: "Crear zona" }));

      expect(await screen.findByTestId("zones-error")).toHaveTextContent("OESTE");
    });
  });

  describe("editing a zone", () => {
    it("renames a zone without touching its code", async () => {
      render(<ZonasPage />);

      fireEvent.change(screen.getByTestId("name-z1"), {
        target: { value: "Centro Norte" },
      });
      fireEvent.click(screen.getByTestId("save-z1"));

      await waitFor(() => expect(patch).toHaveBeenCalled());
      expect(patch).toHaveBeenCalledWith("/zones/z1", { name: "Centro Norte" });
      expect(patch.mock.calls[0][1]).not.toHaveProperty("code");
    });

    it("reorders a zone", async () => {
      render(<ZonasPage />);

      fireEvent.change(screen.getByTestId("sort-z1"), { target: { value: "5" } });
      fireEvent.click(screen.getByTestId("save-z1"));

      await waitFor(() => expect(patch).toHaveBeenCalled());
      expect(patch).toHaveBeenCalledWith("/zones/z1", { sortOrder: 5 });
    });

    it("sends nothing when saving a row that was not changed", async () => {
      render(<ZonasPage />);

      fireEvent.click(screen.getByTestId("save-z1"));

      await waitFor(() => expect(mutate).not.toHaveBeenCalled());
      expect(patch).not.toHaveBeenCalled();
    });

    // Dar de baja saca la zona de la lista con la que se dan de alta los
    // clientes; reactivar no rompe nada, asi que solo se pregunta al ocultarla.
    it("deactivates a zone after confirmation", async () => {
      jest.spyOn(window, "confirm").mockReturnValue(true);
      render(<ZonasPage />);

      fireEvent.click(screen.getByTestId("toggle-active-z1"));

      await waitFor(() =>
        expect(patch).toHaveBeenCalledWith("/zones/z1", { isActive: false }),
      );
    });

    it("reactivates a deactivated zone without asking", async () => {
      render(<ZonasPage />);

      fireEvent.click(screen.getByTestId("toggle-active-z2"));

      await waitFor(() =>
        expect(patch).toHaveBeenCalledWith("/zones/z2", { isActive: true }),
      );
    });
  });

  it("shows an empty state when there are no zones", () => {
    mockedUseSWR.mockReturnValue({
      data: [],
      isLoading: false,
      error: undefined,
      mutate,
    });
    render(<ZonasPage />);

    expect(screen.getByTestId("zones-empty")).toBeInTheDocument();
  });
});
