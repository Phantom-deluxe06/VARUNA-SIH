"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, Polyline, Polygon, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { BearingVector, MapPoint, UserStatus } from "@/lib/types";
import { IMBL_PALK_BAY } from "@/lib/types";

const STATUS_COLORS: Record<UserStatus, string> = {
  SAFE: "#22C55E",
  CAUTION: "#F59E0B",
  CRITICAL: "#EF4444",
};

function iconFor(point: MapPoint): L.DivIcon {
  const color =
    point.kind === "port"
      ? "#38BDF8"
      : point.kind === "hotspot"
        ? "#22D3EE"
        : point.kind === "hazard"
          ? "#F59E0B"
          : (point.status ? STATUS_COLORS[point.status] : "#22D3EE");

  const glyph =
    point.kind === "port" ? "⚓" : point.kind === "hotspot" ? "🐟" : point.kind === "hazard" ? "⚠" : "⛵";

  return L.divIcon({
    className: "varuna-marker",
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;width:30px;height:30px;">
        ${
          point.status === "CRITICAL"
            ? `<span class="varuna-pulse-critical" style="position:absolute;inset:0;background:${color};opacity:.5;"></span>`
            : ""
        }
        <div style="position:relative;display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:${color};border:2px solid #0F172A;box-shadow:0 2px 8px rgba(0,0,0,.6);font-size:13px;">${glyph}</div>
      </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  });
}

function Recenter({ center, zoomKey }: { center: [number, number]; zoomKey: string }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, 8, { duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomKey]);
  return null;
}

export type MarineMapProps = {
  points: MapPoint[];
  bearing?: BearingVector | null;
  focus?: [number, number] | null;
};

export default function MarineMap({ points, bearing, focus }: MarineMapProps) {
  const center = useMemo<[number, number]>(
    () => focus ?? [9.28, 79.31],
    [focus],
  );

  return (
    <MapContainer
      center={center}
      zoom={7}
      minZoom={4}
      maxZoom={15}
      scrollWheelZoom
      className="h-full w-full"
      attributionControl
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png"
        subdomains={["a", "b", "c", "d"]}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
      />
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png"
        subdomains={["a", "b", "c", "d"]}
        attribution=""
      />
      <Recenter center={center} zoomKey={`${center[0]},${center[1]}`} />

      {/* IMBL Palk Bay restricted zone */}
      <Polygon
        positions={IMBL_PALK_BAY}
        pathOptions={{
          color: "#EF4444",
          weight: 2,
          dashArray: "8 6",
          fillColor: "#EF4444",
          fillOpacity: 0.12,
        }}
      >
        <Popup>
          <strong>IMBL Boundary</strong>
          <br />
          Palk Bay restricted zone
        </Popup>
      </Polygon>

      {/* Bearing vector from user to PFZ hotspot */}
      {bearing && (
        <>
          <Polyline
            positions={[bearing.from, bearing.to]}
            pathOptions={{ color: "#22D3EE", weight: 2.5, dashArray: "6 8" }}
          />
          <Polyline
            positions={[bearing.from, bearing.to]}
            pathOptions={{ color: "#22D3EE", weight: 12, opacity: 0.12 }}
          />
        </>
      )}

      {points.map((p, i) => (
        <Marker key={`${p.kind}-${p.lat},${p.lon}-${i}`} position={[p.lat, p.lon]} icon={iconFor(p)}>
          <Popup>
            <strong>{p.label}</strong>
            {p.status ? (
              <>
                <br />
                Status: <span style={{ color: STATUS_COLORS[p.status] }}>{p.status}</span>
              </>
            ) : null}
            {bearing && p.kind === "hotspot" ? (
              <>
                <br />
                Bearing: {bearing.bearing_degrees}&deg; &middot; {bearing.distance_km} km
              </>
            ) : null}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
