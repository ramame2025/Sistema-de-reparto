"use client";

import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Todo lo que toca Leaflet vive aca y en ningun otro lado. Leaflet accede a
 * `window` al evaluarse, asi que este modulo NUNCA debe importarse de forma
 * estatica: `LocationPicker` lo carga con next/dynamic y `ssr: false`.
 */

// Los iconos por defecto de Leaflet se resuelven con URLs relativas al CSS,
// que el bundler reescribe y rompe. Un icono propio evita el marcador
// invisible, que es el sintoma clasico de esta integracion.
const markerIcon = L.divIcon({
  className: "",
  html: '<div style="width:18px;height:18px;border-radius:9999px;background:#0369a1;border:3px solid white;box-shadow:0 0 0 1px #0369a1"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const DEFAULT_CENTER: [number, number] = [-34.6037, -58.3816];
const DEFAULT_ZOOM = 12;
const PICKED_ZOOM = 16;

export type LocationMapProps = {
  latitude?: number;
  longitude?: number;
  onPick: (latitude: number, longitude: number) => void;
};

function ClickCapture({ onPick }: { onPick: LocationMapProps["onPick"] }) {
  useMapEvents({
    click: (event) => onPick(event.latlng.lat, event.latlng.lng),
  });
  return null;
}

/** Recentra cuando el pin cambia desde afuera (por ejemplo al abrir otra fila). */
function RecenterOnPin({ latitude, longitude }: Omit<LocationMapProps, "onPick">) {
  const map = useMap();

  useEffect(() => {
    if (latitude !== undefined && longitude !== undefined) {
      map.setView([latitude, longitude], PICKED_ZOOM);
    }
  }, [map, latitude, longitude]);

  return null;
}

export default function LocationMap({ latitude, longitude, onPick }: LocationMapProps) {
  const hasPin = latitude !== undefined && longitude !== undefined;
  const center: [number, number] = hasPin ? [latitude, longitude] : DEFAULT_CENTER;

  return (
    <MapContainer
      center={center}
      zoom={hasPin ? PICKED_ZOOM : DEFAULT_ZOOM}
      scrollWheelZoom
      style={{ height: 320, width: "100%", borderRadius: 8 }}
    >
      {/* La atribucion no es decorativa: la politica de uso de tiles de OSM la exige. */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickCapture onPick={onPick} />
      <RecenterOnPin latitude={latitude} longitude={longitude} />
      {hasPin && (
        <Marker
          position={[latitude, longitude]}
          icon={markerIcon}
          draggable
          eventHandlers={{
            dragend: (event) => {
              const { lat, lng } = event.target.getLatLng();
              onPick(lat, lng);
            },
          }}
        />
      )}
    </MapContainer>
  );
}
