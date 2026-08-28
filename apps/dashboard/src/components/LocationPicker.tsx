"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

export type LocationValue = {
  latitude: number | null;
  longitude: number | null;
};

export type LocationPickerProps = {
  latitude?: number;
  longitude?: number;
  /** Las dos coordenadas viajan siempre juntas, tambien al limpiarlas. */
  onChange: (value: LocationValue) => void;
};

/**
 * Envuelve el mapa y expone un contrato sin Leaflet: coordenadas adentro,
 * coordenadas afuera. La carga dinamica con `ssr: false` es obligatoria —
 * Leaflet toca `window` al evaluarse y tumbaria el render de servidor de Next.
 */
export function LocationPicker({ latitude, longitude, onChange }: LocationPickerProps) {
  const LocationMap = useMemo(
    () =>
      dynamic(() => import("./LocationMap"), {
        ssr: false,
        loading: () => <p className="text-sm text-slate-600">Cargando mapa...</p>,
      }),
    [],
  );

  const hasPin = latitude !== undefined && longitude !== undefined;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span data-testid="location-readout" className="text-sm text-slate-600">
          {hasPin ? `Ubicacion: ${latitude}, ${longitude}` : "Sin ubicacion"}
        </span>
        {hasPin && (
          <button
            type="button"
            onClick={() => onChange({ latitude: null, longitude: null })}
            className="rounded bg-slate-200 px-3 py-1 text-sm text-slate-700 hover:bg-slate-300"
          >
            Quitar ubicacion
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Toca el mapa para poner el pin, o arrastralo para corregirlo.
      </p>
      <LocationMap
        latitude={latitude}
        longitude={longitude}
        onPick={(lat, lng) => onChange({ latitude: lat, longitude: lng })}
      />
    </div>
  );
}
