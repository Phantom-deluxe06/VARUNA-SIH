"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import {
  Circle,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { IMBL_DASHBOARD_LINE, type PfzZone, type UserStatus } from "@/lib/types";

const STATUS_COLOR: Record<UserStatus, string> = {
  SAFE: "#00ff88",
  CAUTION: "#ff6b35",
  CRITICAL: "#ff3333",
};

const DEFAULT_ZONES: PfzZone[] = [
  { lat: 9.5, lon: 80.2, confidence: 0.8, bearing: 90, distance_nm: 20, radius: 5000 },
  { lat: 9.2, lon: 80.5, confidence: 0.65, bearing: 100, distance_nm: 30, radius: 8000 },
];

/** Build a ribbon polygon around the IMBL line, offset by `deg` degrees N/S. */
function bufferRibbon(line: [number, number][], deg: number): [number, number][] {
  const north = line.map(([lat, lon]) => [lat + deg, lon] as [number, number]);
  const south = line.map(([lat, lon]) => [lat - deg, lon] as [number, number]);
  return [...north, ...south.reverse()];
}

function vesselIcon(status: UserStatus): L.DivIcon {
  const color = STATUS_COLOR[status];
  return L.divIcon({
    className: "varuna-vessel-marker",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:${color};border:2px solid #0a1628;box-shadow:0 0 12px ${color};font-size:15px;">⛵</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  });
}

function Recenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], map.getZoom(), { animate: true });
  }, [lat, lon, map]);
  return null;
}

export type MarineMapProps = {
  vesselLat: number;
  vesselLon: number;
  pfzZones?: PfzZone[];
  status?: UserStatus;
  className?: string;
};

export function MarineMap({
  vesselLat,
  vesselLon,
  pfzZones,
  status = "SAFE",
  className = "",
}: MarineMapProps) {
  const zones = pfzZones?.length ? pfzZones : DEFAULT_ZONES;
  const dangerBuffer = useMemo(() => bufferRibbon(IMBL_DASHBOARD_LINE, 0.033), []);
  const cautionBuffer = useMemo(() => bufferRibbon(IMBL_DASHBOARD_LINE, 0.083), []);

  return (
    <MapContainer
      center={[vesselLat, vesselLon]}
      zoom={9}
      minZoom={5}
      maxZoom={15}
      scrollWheelZoom
      className={`h-full w-full ${className}`}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        subdomains={["a", "b", "c", "d"]}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        maxZoom={20}
      />
      <Recenter lat={vesselLat} lon={vesselLon} />

      {/* 5 NM caution buffer */}
      <Polygon
        positions={cautionBuffer}
        pathOptions={{ color: "#ff6b35", weight: 1, fillColor: "#ff6b35", fillOpacity: 0.08 }}
      />
      {/* 2 NM danger buffer */}
      <Polygon
        positions={dangerBuffer}
        pathOptions={{ color: "#ff3333", weight: 1, fillColor: "#ff3333", fillOpacity: 0.14 }}
      />
      {/* IMBL demarcation line */}
      <Polyline
        positions={IMBL_DASHBOARD_LINE}
        pathOptions={{ color: "#ff3333", weight: 2.5, dashArray: "8 6" }}
      >
        <Popup>International Maritime Boundary Line (IMBL) · Palk Bay</Popup>
      </Polyline>

      {/* PFZ zones */}
      {zones.map((z, i) => (
        <Circle
          key={`pfz-${i}`}
          center={[z.lat, z.lon]}
          radius={z.radius ?? 5000}
          pathOptions={{ color: "#00d4ff", weight: 1.5, fillColor: "#00d4ff", fillOpacity: 0.22 }}
        >
          <Popup>
            <strong>Potential Fishing Zone</strong>
            <br />
            Confidence: {(z.confidence * 100).toFixed(0)}%
            <br />
            {z.distance_nm} NM @ {z.bearing}°
          </Popup>
        </Circle>
      ))}

      {/* Vessel */}
      <Marker position={[vesselLat, vesselLon]} icon={vesselIcon(status)}>
        <Popup>
          Your vessel
          <br />
          {vesselLat.toFixed(4)}°N, {vesselLon.toFixed(4)}°E
          <br />
          Status: {status}
        </Popup>
      </Marker>
    </MapContainer>
  );
}

export default MarineMap;
