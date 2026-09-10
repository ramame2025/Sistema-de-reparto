import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    zoneId: "z1",
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

const ZONES = [
  {
    id: "z1",
    code: "NORTE",
    name: "Norte",
    isActive: true,
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "z2",
    code: "OESTE",
    name: "Oeste",
    isActive: true,
    sortOrder: 1,
    createdAt: "",
    updatedAt: "",
  },
];

const CATEGORIES = [
  {
    id: "k1",
    code: "final",
    name: "Final",
    isActive: true,
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "k2",
    code: "mayorista",
    name: "Mayorista",
    isActive: true,
    sortOrder: 1,
    createdAt: "",
    updatedAt: "",
  },
];

/**
 * La pagina pide tres cosas: el padron, las zonas y las categorias de cliente,
 * las dos ultimas para sus selects.
 */
function swrByKey(
  customers: unknown = CUSTOMERS,
  zones: unknown = ZONES,
  categories: unknown = CATEGORIES,
) {
  return (key: string) => ({
    data:
      key === "/zones"
        ? zones
        : key === "/customer-categories"
          ? categories
          : customers,
    isLoading: false,
    error: undefined,
    mutate,
  });
}

const mutate = jest.fn();

describe("ClientesPage", () => {
  const post = jest.fn();
  const patch = jest.fn();

  beforeEach(() => {
    post.mockReset().mockResolvedValue({});
    patch.mockReset().mockResolvedValue({});
    mutate.mockReset();
    mockedUseApiClient.mockReturnValue({ post, patch });
    mockedUseSWR.mockImplementation(swrByKey());
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
    mockedUseSWR.mockImplementation(swrByKey([{ ...CUSTOMERS[1], name: "Don José" }]));
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
    fireEvent.change(screen.getByLabelText("Zona"), { target: { value: "z2" } });
    fireEvent.change(screen.getByLabelText("Direccion"), {
      target: { value: "Calle 5 num 100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear cliente" }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith("/customers", {
      name: "Kiosco Nuevo",
      customerType: "final",
      zoneId: "z2",
      address: "Calle 5 num 100",
    });
  });

  // La zona dejo de ser texto libre: se elige de la lista que administra el
  // admin, asi que cuatro grafias de "Centro" ya no pueden forkear una zona.
  it("offers the zones from the catalogue instead of a free-text field", () => {
    render(<ClientesPage />);

    const select = screen.getByLabelText("Zona");
    expect(select.tagName).toBe("SELECT");
    expect(
      Array.from(select.querySelectorAll("option")).map((option) => option.textContent),
    ).toEqual(["Sin zona", "Norte", "Oeste"]);
  });

  // El tipo de cliente dejo de ser una constante de tres valores: sale de la
  // tabla que administra el admin, con el nombre que el le puso.
  it("offers the categories from the catalogue instead of the hardcoded three", () => {
    render(<ClientesPage />);

    const select = screen.getByLabelText("Tipo");
    expect(select.tagName).toBe("SELECT");
    expect(
      Array.from(select.querySelectorAll("option")).map((option) => option.textContent),
    ).toEqual(["Final", "Mayorista"]);
    expect(
      Array.from(select.querySelectorAll("option")).map(
        (option) => (option as HTMLOptionElement).value,
      ),
    ).toEqual(["final", "mayorista"]);
  });

  it("creates a customer with the category the admin picked", async () => {
    render(<ClientesPage />);

    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Kiosco Nuevo" },
    });
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "mayorista" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear cliente" }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith("/customers", {
      name: "Kiosco Nuevo",
      customerType: "mayorista",
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

    it("moves the customer to another zone by id", async () => {
      render(<ClientesPage />);

      fireEvent.click(screen.getByTestId("edit-c1"));
      fireEvent.change(screen.getByLabelText("Zona del cliente"), {
        target: { value: "z2" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

      await waitFor(() => expect(patch).toHaveBeenCalled());
      expect(patch).toHaveBeenCalledWith("/customers/c1", { zoneId: "z2" });
    });

    it("clears the zone with null rather than an empty string", async () => {
      render(<ClientesPage />);

      fireEvent.click(screen.getByTestId("edit-c1"));
      fireEvent.change(screen.getByLabelText("Zona del cliente"), {
        target: { value: "" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

      await waitFor(() => expect(patch).toHaveBeenCalled());
      expect(patch).toHaveBeenCalledWith("/customers/c1", { zoneId: null });
    });

    it("loads the editing row with the zone the customer already has", () => {
      render(<ClientesPage />);

      fireEvent.click(screen.getByTestId("edit-c1"));

      expect(screen.getByLabelText("Zona del cliente")).toHaveValue("z1");
    });

    // Una zona dada de baja no esta en la lista, pero el cliente la sigue
    // teniendo: sin esta opcion el select se veria vacio y editar cualquier
    // otro campo pareceria estar sacandole la zona.
    it("keeps showing a zone that is no longer in the catalogue", () => {
      mockedUseSWR.mockImplementation(swrByKey(CUSTOMERS, [ZONES[1]]));
      render(<ClientesPage />);

      fireEvent.click(screen.getByTestId("edit-c1"));

      expect(screen.getByLabelText("Zona del cliente")).toHaveValue("z1");
      expect(screen.getByRole("option", { name: "Norte" })).toBeInTheDocument();
    });

    it("loads the editing row with the category the customer already has", () => {
      render(<ClientesPage />);

      fireEvent.click(screen.getByTestId("edit-c1"));

      expect(screen.getByLabelText("Tipo del cliente")).toHaveValue("comercio");
    });

    // Mismo criterio que con la zona: una categoria dada de baja ya no viene
    // en la lista, pero el cliente la sigue teniendo. Sin esta opcion el
    // select se veria vacio y editar cualquier otro campo pareceria estar
    // sacandole la categoria.
    it("keeps showing a category that is no longer in the catalogue", () => {
      render(<ClientesPage />);

      fireEvent.click(screen.getByTestId("edit-c1"));

      const select = screen.getByLabelText("Tipo del cliente");
      expect(select).toHaveValue("comercio");
      expect(
        Array.from(select.querySelectorAll("option")).map(
          (option) => (option as HTMLOptionElement).value,
        ),
      ).toEqual(["comercio", "final", "mayorista"]);
    });

    it("changes the category of an existing customer", async () => {
      render(<ClientesPage />);

      fireEvent.click(screen.getByTestId("edit-c1"));
      fireEvent.change(screen.getByLabelText("Tipo del cliente"), {
        target: { value: "mayorista" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

      await waitFor(() => expect(patch).toHaveBeenCalled());
      expect(patch).toHaveBeenCalledWith("/customers/c1", {
        customerType: "mayorista",
      });
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

  describe("sin ubicacion filter", () => {
    it("shows only the customers with no pin when the filter is on", () => {
      render(<ClientesPage />);

      fireEvent.click(screen.getByLabelText("Solo sin ubicacion"));

      expect(screen.queryByText("Almacen Norte")).not.toBeInTheDocument();
      expect(screen.getByText("Kiosco Sur")).toBeInTheDocument();
    });

    it("restores the full directory when the filter is turned off", () => {
      render(<ClientesPage />);
      const filter = screen.getByLabelText("Solo sin ubicacion");

      fireEvent.click(filter);
      fireEvent.click(filter);

      expect(screen.getByText("Almacen Norte")).toBeInTheDocument();
      expect(screen.getByText("Kiosco Sur")).toBeInTheDocument();
    });

    it("combines with the search box instead of replacing it", () => {
      render(<ClientesPage />);

      fireEvent.click(screen.getByLabelText("Solo sin ubicacion"));
      fireEvent.change(screen.getByLabelText("Buscar"), {
        target: { value: "almacen" },
      });

      expect(screen.getByTestId("customers-empty")).toBeInTheDocument();
    });
  });

  it("shows an empty state when the directory has no customers", () => {
    mockedUseSWR.mockImplementation(swrByKey([]));
    render(<ClientesPage />);

    expect(screen.getByTestId("customers-empty")).toBeInTheDocument();
  });

  describe("filtros de tipo y zona + paginacion", () => {
    // Las zonas y las categorias ya no salen del padron: son dos endpoints
    // aparte, asi que el mock tiene que responder por clave.
    const withCustomers = (data: unknown[]) => {
      mockedUseSWR.mockImplementation(swrByKey(data));
      render(<ClientesPage />);
    };

    const makeCustomers = (count: number, overrides: Record<string, unknown> = {}) =>
      Array.from({ length: count }, (_, i) => ({
        id: `p${i + 1}`,
        name: `Cliente ${String(i + 1).padStart(2, "0")}`,
        customerType: "comercio",
        zone: "Centro",
        isActive: true,
        createdAt: "",
        updatedAt: "",
        ...overrides,
      }));

    const rowCount = () =>
      screen.getAllByRole("button", { name: "Editar" }).length;

    it("filters the directory by customer type", () => {
      withCustomers(CUSTOMERS);

      // "final" y no "comercio": las opciones del filtro salen de las
      // categorias vigentes, y "comercio" es justamente la dada de baja que
      // el fixture usa para probar el fallback de la fila en edicion.
      fireEvent.change(screen.getByLabelText("Filtrar por tipo"), {
        target: { value: "final" },
      });

      expect(screen.getByText("Kiosco Sur")).toBeInTheDocument();
      expect(screen.queryByText("Almacen Norte")).not.toBeInTheDocument();
    });

    it("filters the directory by zone, offering only the zones the API returns", () => {
      withCustomers(CUSTOMERS);

      const zoneSelect = screen.getByLabelText("Filtrar por zona");
      expect(
        within(zoneSelect).getByRole("option", { name: "Norte" }),
      ).toBeInTheDocument();
      expect(
        within(zoneSelect).queryByRole("option", { name: "Sur" }),
      ).not.toBeInTheDocument();

      fireEvent.change(zoneSelect, { target: { value: "Norte" } });

      expect(screen.getByText("Almacen Norte")).toBeInTheDocument();
      expect(screen.queryByText("Kiosco Sur")).not.toBeInTheDocument();
    });

    it("combines the type and zone filters with the search box", () => {
      withCustomers([
        ...CUSTOMERS,
        {
          id: "c3",
          name: "Almacen Centro",
          customerType: "comercio",
          zone: "Norte",
          isActive: true,
          createdAt: "",
          updatedAt: "",
        },
      ]);

      fireEvent.change(screen.getByLabelText("Filtrar por zona"), {
        target: { value: "Norte" },
      });
      fireEvent.change(screen.getByLabelText("Buscar"), {
        target: { value: "centro" },
      });

      expect(screen.getByText("Almacen Centro")).toBeInTheDocument();
      expect(screen.queryByText("Almacen Norte")).not.toBeInTheDocument();
    });

    it("shows at most 15 rows per page and pages through the rest", () => {
      withCustomers(makeCustomers(20));

      expect(rowCount()).toBe(15);
      expect(
        screen.getByText(/P[aá]gina 1 de 2 \(20 clientes\)/),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

      expect(rowCount()).toBe(5);
      expect(screen.getByText(/P[aá]gina 2 de 2/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
    });

    it("returns to page 1 when a filter changes", () => {
      // Los 20 son "final" para que el filtro no achique el conjunto: lo que
      // se prueba aca es que cambiar de filtro vuelve a la pagina 1, no el
      // filtrado en si.
      withCustomers(makeCustomers(20, { customerType: "final" }));

      fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
      expect(screen.getByText(/P[aá]gina 2 de 2/)).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("Filtrar por tipo"), {
        target: { value: "final" },
      });

      expect(screen.getByText(/P[aá]gina 1 de 2/)).toBeInTheDocument();
      expect(rowCount()).toBe(15);
    });
  });
});
