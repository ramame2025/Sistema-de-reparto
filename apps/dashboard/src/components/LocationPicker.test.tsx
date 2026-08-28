import { fireEvent, render, screen } from "@testing-library/react";
import { LocationPicker } from "./LocationPicker";

// Leaflet needs a real DOM with layout and never runs in this suite. The map
// is stubbed at the next/dynamic boundary, which is exactly the seam that
// keeps it out of the server bundle in production too.
jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () =>
    function MapStub({
      latitude,
      longitude,
      onPick,
    }: {
      latitude?: number;
      longitude?: number;
      onPick: (lat: number, lng: number) => void;
    }) {
      return (
        <div data-testid="map-stub">
          <span data-testid="map-marker">
            {latitude !== undefined && longitude !== undefined
              ? `${latitude},${longitude}`
              : "sin marcador"}
          </span>
          <button type="button" onClick={() => onPick(-34.61, -58.38)}>
            simular click
          </button>
        </div>
      );
    },
}));

describe("LocationPicker", () => {
  const onChange = jest.fn();

  beforeEach(() => onChange.mockReset());

  it("reports both coordinates together when the map is clicked", () => {
    render(<LocationPicker onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "simular click" }));

    expect(onChange).toHaveBeenCalledWith({ latitude: -34.61, longitude: -58.38 });
  });

  it("shows the current coordinates as a readable value", () => {
    render(<LocationPicker latitude={-34.6} longitude={-58.4} onChange={onChange} />);

    expect(screen.getByTestId("location-readout")).toHaveTextContent("-34.6");
    expect(screen.getByTestId("location-readout")).toHaveTextContent("-58.4");
  });

  it("says so when there is no pin yet", () => {
    render(<LocationPicker onChange={onChange} />);

    expect(screen.getByTestId("location-readout")).toHaveTextContent("Sin ubicacion");
  });

  // Clearing must null BOTH halves: the API rejects a half-set pair, because
  // a record holding one coordinate looks located but cannot be ranked.
  it("clears both coordinates at once", () => {
    render(<LocationPicker latitude={-34.6} longitude={-58.4} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Quitar ubicacion" }));

    expect(onChange).toHaveBeenCalledWith({ latitude: null, longitude: null });
  });

  it("offers nothing to clear when there is no pin", () => {
    render(<LocationPicker onChange={onChange} />);

    expect(
      screen.queryByRole("button", { name: "Quitar ubicacion" }),
    ).not.toBeInTheDocument();
  });

  it("passes the current pin down to the map", () => {
    render(<LocationPicker latitude={-34.6} longitude={-58.4} onChange={onChange} />);

    expect(screen.getByTestId("map-marker")).toHaveTextContent("-34.6,-58.4");
  });
});
