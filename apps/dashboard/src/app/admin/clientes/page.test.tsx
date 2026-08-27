import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import useSWR from "swr";
import { useApiClient } from "../../../context/AuthContext";
import { ApiError } from "../../../lib/api-client";
import ClientesPage from "./page";

jest.mock("swr", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("../../../context/AuthContext", () => ({
  useApiClient: jest.fn(),
}));

// The map itself is exercised in LocationPicker.test.tsx; here only the
// coordinates it hands back matter.
jest.mock("../../../components/LocationPicker", () => ({
  LocationPicker: ({
    latitude,
    longitude,
    onChange,
  }: {
    latitude?: number;
    longitude?: number;
    onChange: (value: { latitude: number | null; longitude: number | null }) => void;
  }) => (
    <div>
      <span data-testid="picker-value">
        {latitude !== undefined && longitude !== undefined
          ? `${latitude},${longitude}`
          : "sin pin"}
      </span>
      <button
        type="button"
        onClick={() => onChange({ latitude: -34.61, longitude: -58.38 })}
      >
        poner pin
      </button>
      <button
        type="button"
        onClick={() => onChange({ latitude: null, longitude: null })}
      >
        sacar pin
      </button>
    </div>
  ),
}));

const mockedUseSWR = useSWR as unknown as jest.Mock;
const mockedUseApiClient = useApiClient as unknown as jest.Mock;

const CUSTOMERS = [
  {
    id: "c1",
    name: "Almacen Norte",
    customerType: "comercio",
    zone: "Norte",
    address: "Av. Mitre 1234",
    latitude: -34.6,
    longitude: -58.4,
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

describe("ClientesPage", () => {
  const post = jest.fn();
  const patch = jest.fn();
  const mutate = jest.fn();

  beforeEach(() => {
    post.mockReset().mockResolvedValue({});
    patch.mockReset().mockResolvedValue({});
    mutate.mockReset();
    mockedUseApiClient.mockReturnValue({ post, patch });
    mockedUseSWR.mockReturnValue({
      data: CUSTOMERS,
      isLoading: false,
      error: undefined,
      mutate,
    });
  });

  it("lists the customers in the directory", () => {
    render(<ClientesPage />);

    expect(screen.getByText("Almacen Norte")).toBeInTheDocument();
    expect(screen.getByText("Kiosco Sur")).toBeInTheDocument();
  });

  it("shows the street address when the customer has one", () => {
    render(<ClientesPage />);

    expect(screen.getByText("Av. Mitre 1234")).toBeInTheDocument();
  });

  it("filters the list by name as the admin types", () => {
    render(<ClientesPage />);

    fireEvent.change(screen.getByLabelText("Buscar"), {
      target: { value: "kiosco" },
    });

    expect(screen.queryByText("Almacen Norte")).not.toBeInTheDocument();
    expect(screen.getByText("Kiosco Sur")).toBeInTheDocument();
  });

  // Accent folding matters in the search box for the same reason it matters
  // in duplicate detection: nobody types the accent.
  it("ignores accents and casing while searching", () => {
    mockedUseSWR.mockReturnValue({
      data: [{ ...CUSTOMERS[1], name: "Don José" }],
      isLoading: false,
      error: undefined,
      mutate,
    });
    render(<ClientesPage />);

    fireEvent.change(screen.getByLabelText("Buscar"), {
      target: { value: "jose" },
    });

    expect(screen.getByText("Don José")).toBeInTheDocument();
  });

  it("counts the customers with no pin, so an incomplete directory is visible", () => {
    render(<ClientesPage />);

    expect(screen.getByTestId("customers-without-location")).toHaveTextContent("1");
  });

  it("creates a customer with name, type, zone and address", async () => {
    render(<ClientesPage />);

    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Kiosco Nuevo" },
    });
    fireEvent.change(screen.getByLabelText("Zona"), { target: { value: "Oeste" } });
    fireEvent.change(screen.getByLabelText("Direccion"), {
      target: { value: "Calle 5 num 100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear cliente" }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith("/customers", {
      name: "Kiosco Nuevo",
      customerType: "final",
      zone: "Oeste",
      address: "Calle 5 num 100",
    });
  });

  it("omits zone and address entirely when left blank, instead of sending empty strings", async () => {
    render(<ClientesPage />);

    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Kiosco Nuevo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear cliente" }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith("/customers", {
      name: "Kiosco Nuevo",
      customerType: "final",
    });
  });

  it("keeps the create button disabled until the name is long enough", () => {
    render(<ClientesPage />);
    const submit = screen.getByRole("button", { name: "Crear cliente" });

    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "K" } });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Ki" } });
    expect(submit).toBeEnabled();
  });

  describe("duplicate conflict", () => {
    const conflict = () =>
      post.mockRejectedValueOnce(
        new ApiError(409, {
          message: "duplicate",
          customer: { id: "c9", name: "Don Jose", zone: "Sur" },
        }),
      );

    it("names the conflicting customer instead of showing a bare error", async () => {
      conflict();
      render(<ClientesPage />);

      fireEvent.change(screen.getByLabelText("Nombre"), {
        target: { value: "Don Jose" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Crear cliente" }));

      expect(await screen.findByTestId("duplicate-warning")).toHaveTextContent(
        "Don Jose",
      );
    });

    it("retries allowing the duplicate when the admin confirms it is another customer", async () => {
      conflict();
      render(<ClientesPage />);

      fireEvent.change(screen.getByLabelText("Nombre"), {
        target: { value: "Don Jose" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Crear cliente" }));
      fireEvent.click(await screen.findByRole("button", { name: "Crear igual" }));

      await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
      expect(post).toHaveBeenLastCalledWith("/customers?allowDuplicate=true", {
        name: "Don Jose",
        customerType: "final",
      });
    });

    it("does not create anything if the admin dismisses the warning", async () => {
      conflict();
      render(<ClientesPage />);

      fireEvent.change(screen.getByLabelText("Nombre"), {
        target: { value: "Don Jose" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Crear cliente" }));
      fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

      await waitFor(() =>
        expect(screen.queryByTestId("duplicate-warning")).not.toBeInTheDocument(),
      );
      expect(post).toHaveBeenCalledTimes(1);
    });
  });

  describe("editing", () => {
    it("patches only the fields the admin changed", async () => {
      render(<ClientesPage />);

      fireEvent.click(screen.getByTestId("edit-c1"));
      fireEvent.change(screen.getByLabelText("Nombre del cliente"), {
        target: { value: "Almacen Norte SRL" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

      await waitFor(() => expect(patch).toHaveBeenCalled());
      expect(patch).toHaveBeenCalledWith("/customers/c1", {
        name: "Almacen Norte SRL",
      });
    });

    it("sends nothing when the admin saves without changing anything", async () => {
      render(<ClientesPage />);

      fireEvent.click(screen.getByTestId("edit-c1"));
      fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

      await waitFor(() =>
        expect(screen.queryByLabelText("Nombre del cliente")).not.toBeInTheDocument(),
      );
      expect(patch).not.toHaveBeenCalled();
    });

    it("clears the address with null rather than an empty string", async () => {
      render(<ClientesPage />);

      fireEvent.click(screen.getByTestId("edit-c1"));
      fireEvent.change(screen.getByLabelText("Direccion del cliente"), {
        target: { value: "" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

      await waitFor(() => expect(patch).toHaveBeenCalled());
      expect(patch).toHaveBeenCalledWith("/customers/c1", { address: null });
    });
  });

  it("deactivates a customer after confirmation", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    const remove = jest.fn().mockResolvedValue(undefined);
    mockedUseApiClient.mockReturnValue({ post, patch, remove });
    render(<ClientesPage />);

    fireEvent.click(screen.getByTestId("deactivate-c1"));

    await waitFor(() => expect(remove).toHaveBeenCalledWith("/customers/c1"));
  });

  describe("map pin", () => {
    it("sends both coordinates when the admin drops a pin before creating", async () => {
      render(<ClientesPage />);

      fireEvent.change(screen.getByLabelText("Nombre"), {
        target: { value: "Kiosco Nuevo" },
      });
      fireEvent.click(screen.getAllByRole("button", { name: "poner pin" })[0]);
      fireEvent.click(screen.getByRole("button", { name: "Crear cliente" }));

      await waitFor(() => expect(post).toHaveBeenCalled());
      expect(post).toHaveBeenCalledWith("/customers", {
        name: "Kiosco Nuevo",
        customerType: "final",
        latitude: -34.61,
        longitude: -58.38,
      });
    });

    it("creates without coordinates when no pin was dropped", async () => {
      render(<ClientesPage />);

      fireEvent.change(screen.getByLabelText("Nombre"), {
        target: { value: "Kiosco Nuevo" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Crear cliente" }));

      await waitFor(() => expect(post).toHaveBeenCalled());
      const [, payload] = post.mock.calls[0];
      expect(payload).not.toHaveProperty("latitude");
      expect(payload).not.toHaveProperty("longitude");
    });

    it("resets the pin after a successful create, so it does not leak into the next customer", async () => {
      render(<ClientesPage />);

      fireEvent.change(screen.getByLabelText("Nombre"), {
        target: { value: "Kiosco Nuevo" },
      });
      fireEvent.click(screen.getAllByRole("button", { name: "poner pin" })[0]);
      fireEvent.click(screen.getByRole("button", { name: "Crear cliente" }));

      await waitFor(() => expect(post).toHaveBeenCalled());
      expect(screen.getAllByTestId("picker-value")[0]).toHaveTextContent("sin pin");
    });

    it("moves an existing customer pin through PATCH", async () => {
      render(<ClientesPage />);

      fireEvent.click(screen.getByTestId("edit-c1"));
      fireEvent.click(screen.getAllByRole("button", { name: "poner pin" })[1]);
      fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

      await waitFor(() => expect(patch).toHaveBeenCalled());
      expect(patch).toHaveBeenCalledWith("/customers/c1", {
        latitude: -34.61,
        longitude: -58.38,
      });
    });

    it("clears an existing pin with both halves null", async () => {
      render(<ClientesPage />);

      fireEvent.click(screen.getByTestId("edit-c1"));
      fireEvent.click(screen.getAllByRole("button", { name: "sacar pin" })[1]);
      fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

      await waitFor(() => expect(patch).toHaveBeenCalled());
      expect(patch).toHaveBeenCalledWith("/customers/c1", {
        latitude: null,
        longitude: null,
      });
    });

    it("leaves coordinates out of the patch when the pin was not touched", async () => {
      render(<ClientesPage />);

      fireEvent.click(screen.getByTestId("edit-c1"));
      fireEvent.change(screen.getByLabelText("Nombre del cliente"), {
        target: { value: "Almacen Norte SRL" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

      await waitFor(() => expect(patch).toHaveBeenCalled());
      const [, payload] = patch.mock.calls[0];
      expect(payload).not.toHaveProperty("latitude");
      expect(payload).not.toHaveProperty("longitude");
    });

    it("loads the editing row with the customer stored pin", () => {
      render(<ClientesPage />);

      fireEvent.click(screen.getByTestId("edit-c1"));

      expect(screen.getAllByTestId("picker-value")[1]).toHaveTextContent(
        "-34.6,-58.4",
      );
    });
  });

  it("shows an empty state when the directory has no customers", () => {
    mockedUseSWR.mockReturnValue({
      data: [],
      isLoading: false,
      error: undefined,
      mutate,
    });
    render(<ClientesPage />);

    expect(screen.getByTestId("customers-empty")).toBeInTheDocument();
  });
});
