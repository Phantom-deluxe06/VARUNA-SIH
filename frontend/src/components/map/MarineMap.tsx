"use client";

import { useMemo, useState } from "react";
import L from "leaflet";
import {
  Circle,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { IMBL_COORDS, type PfzZone, type VesselStatus } from "@/lib/api";

const TILE_URL =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_LIGHT_URL =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

// Vessel icon: glowing pulsing dot
function vesselIcon() {
  return L.divIcon({
    className: "",
    html: `<span style="position:relative;display:block;width:18px;height:18px">
      <span style="position:absolute;inset:-8px;border-radius:9999px;background:rgba(6,214,160,0.35);animation:var-pulse 2s ease-in-out infinite"></span>
      <span style="position:absolute;inset:0;border-radius:9999px;background:#06D6A0;border:3px solid #03045E;box-shadow:0 0 12px #06D6A0"></span>
    </span>
    <style>@keyframes var-pulse{0%,100%{transform:scale(0.7);opacity:1}50%{transform:scale(1.4);opacity:0.3}}</style>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export interface MarineMapProps {
  vessel?: VesselStatus | null;
  pfzZones?: PfzZone[];
  height?: string;
  zoom?: number;
  onPointSelect?: (p: { lat: number; lon: number }) => void;
  showControls?: boolean;
}

function ClickHandler({ onPointSelect }: { onPointSelect?: (p: { lat: number; lon: number }) => void }) {
  useMapEvents({
    click(e) {
      onPointSelect?.({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
  });
  return null;
}

/** Expands the 5NM caution buffer polyline around the IMBL. */
function bufferPolygon(offsetNm: number): [number, number][] {
  const latOff = offsetNm / 60;
  const pts: [number, number][] = [];
  for (const [lat, lon] of IMBL_COORDS) {
    const lonOff = latOff / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    pts.push([lat + latOff, lon + lonOff]);
  }
  for (let i = IMBL_COORDS.length - 1; i >= 0; i--) {
    const [lat, lon] = IMBL_COORDS[i];
    const lonOff = latOff / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    pts.push([lat - latOff, lon - lonOff]);
  }
  pts.push(pts[0]);
  return pts;
}

export default function MarineMap({
  vessel,
  pfzZones = [],
  height = "400px",
  zoom = 8,
  onPointSelect,
  showControls = true,
}: MarineMapProps) {
  const [dark, setDark] = useState(true);
  const [showPFZ, setShowPFZ] = useState(true);
  const [showIMBL, setShowIMBL] = useState(true);
  const [showBuffers, setShowBuffers] = useState(true);
  const [showSST, setShowSST] = useState(true);

  const vesselPos = useMemo<[number, number] | null>(
    () => (vessel ? [vessel.lat, vessel.lon] : null),
    [vessel],
  );

  const toggle = (label: string, value: boolean, onChange: (v: boolean) => void, color: string) => (
    <button
      key={label}
      onClick={() => onChange(!value)}
      className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-all duration-300"
      style={{
        borderColor: value ? color : "var(--border)",
        color: value ? color : "var(--muted)",
        background: value ? `${color}18` : "transparent",
      }}
      aria-pressed={value}
    >
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: value ? color : "var(--muted)" }} />
      {label}
    </button>
  );

  return (
    <div className="relative overflow-hidden rounded-card" style={{ height }}>
      {showControls && (
        <div className="pointer-events-auto absolute right-3 top-3 z-[500] flex flex-wrap gap-1.5">
          {toggle("SST", showSST, setShowSST, "#FFB703")}
          {toggle("PFZ", showPFZ, setShowPFZ, "#00B4D8")}
          {toggle("IMBL", showIMBL, setShowIMBL, "#EF233C")}
          {toggle("Buffers", showBuffers, setShowBuffers, "#FFB703")}
          {toggle(dark ? "🌙" : "☀️", dark, setDark, "#48CAE4")}
        </div>
      )}

      <MapContainer
        center={vesselPos ?? [9.5, 79.5]}
        zoom={zoom}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
        attributionControl
      >
        <TileLayer
          key={dark ? "dark" : "light"}
          url={dark ? TILE_URL : TILE_LIGHT_URL}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          subdomains="abcd"
          maxZoom={19}
        />

        {/* IMBL boundary — red dashed */}
        {showIMBL && (
          <Polyline positions={IMBL_COORDS} pathOptions={{ color: "#EF233C", weight: 3, dashArray: "10 8" }}>
            <Tooltip sticky>India–Sri Lanka Maritime Boundary (IMBL)</Tooltip>
          </Polyline>
        )}

        {/* Buffers: 2NM danger (red), 5NM caution (orange) */}
        {showBuffers && (
          <>
            <Polygon positions={bufferPolygon(2)} pathOptions={{ color: "#EF233C", fillColor: "#EF233C", fillOpacity: 0.12, weight: 1 }} />
            <Polygon positions={bufferPolygon(5)} pathOptions={{ color: "#FFB703", fillColor: "#FFB703", fillOpacity: 0.08, weight: 1 }} />
          </>
        )}

        {/* PFZ zones — cyan circles */}
        {showPFZ &&
          pfzZones.map((z, i) => (
            <Circle
              key={`${z.lat}-${z.lon}-${i}`}
              center={[z.lat, z.lon]}
              radius={5556}
              pathOptions={{ color: "#00B4D8", fillColor: "#00B4D8", fillOpacity: 0.18, weight: 2 }}
            >
              <Popup>
                <b>Potential Fishing Zone</b>
                <br />
                Distance: {z.distance_nm.toFixed(1)} NM
                <br />
                Bearing: {z.bearing.toFixed(0)}°
                <br />
                Confidence: {(z.confidence * 100).toFixed(0)}%
              </Popup>
            </Circle>
          ))}

        {/* SST heat blob at vessel position */}
        {showSST && vessel && (
          <Circle
            center={[vessel.lat, vessel.lon]}
            radius={22224}
            pathOptions={{ color: "#FFB703", fillColor: "#FFB703", fillOpacity: 0.08, weight: 0 }}
          >
            <Tooltip>SST {vessel.sst_celsius.toFixed(1)}°C</Tooltip>
          </Circle>
        )}

        {/* Vessel marker */}
        {vesselPos && (
          <Marker position={vesselPos} icon={vesselIcon()}>
            <Popup>
              <b>Live Vessel Position</b>
              <br />
              {vesselPos[0].toFixed(4)}, {vesselPos[1].toFixed(4)}
              <br />
              Heading: {vessel?.heading}° | Speed: {vessel?.speed} kn
              <br />
              IMBL: {vessel?.imbl_distance_nm.toFixed(2)} NM
            </Popup>
          </Marker>
        )}

        <ClickHandler onPointSelect={onPointSelect} />
      </MapContainer>
    </div>
  );
}
