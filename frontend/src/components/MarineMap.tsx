"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import DeckGL from "@deck.gl/react";
import { HexagonLayer } from "@deck.gl/aggregation-layers";
import { GeoJsonLayer } from "@deck.gl/layers";
import type { PickingInfo, ViewStateChangeParameters } from "@deck.gl/core";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type { MarineMapProps, MarineMapViewState, SeaHazard } from "../types/marine";
import { SAMPLE_PALK_BAY_IMBL_GEOJSON } from "../data/mockMarineData";

/**
 * Default camera viewport focused on Palk Bay / Coastal Tamil Nadu.
 * Target initial view:
 * Latitude: 9.28
 * Longitude: 79.31
 * Zoom: 8
 * Pitch: 45
 * Bearing: -15
 */
export const DEFAULT_MARINE_VIEWPORT: MarineMapViewState = {
  latitude: 9.28,
  longitude: 79.31,
  zoom: 8,
  pitch: 45,
  bearing: -15,
  maxZoom: 16,
  minZoom: 4,
  maxPitch: 60,
  minPitch: 0,
};

/**
 * Demo sea hazard data points focused on Palk Bay
 */
export const DEFAULT_SEA_HAZARDS: SeaHazard[] = [
  { lat: 9.28, lon: 79.31, risk_level: 0.8 },
  { lat: 9.30, lon: 79.35, risk_level: 0.6 },
  { lat: 9.34, lon: 79.40, risk_level: 0.3 },
  { lat: 9.38, lon: 79.45, risk_level: 0.9 },
  { lat: 9.42, lon: 79.52, risk_level: 1.0 },
  { lat: 9.25, lon: 79.30, risk_level: 0.5 },
  { lat: 9.12, lon: 79.52, risk_level: 0.95 },
  { lat: 9.75, lon: 79.60, risk_level: 0.4 },
];

/**
 * High-contrast color gradient for 2.5D hazard columns (Emerald Green -> Cyan -> Amber -> Orange -> Crimson Red)
 */
const HAZARD_COLOR_RANGE: [number, number, number, number][] = [
  [16, 185, 129, 200],  // Low Risk (Emerald)
  [6, 182, 212, 210],   // Mild Risk (Cyan)
  [245, 158, 11, 220],  // Moderate Risk (Amber)
  [249, 115, 22, 230],  // Elevated Risk (Orange)
  [239, 68, 68, 245],   // High Risk (Bright Red)
  [185, 28, 28, 255],   // Critical Risk (Deep Crimson)
];

/**
 * Default map style using CARTO Dark Matter GL vector style (no API key required).
 */
export const DEFAULT_MAP_STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE ||
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/**
 * MarineMap Component for VARUNA GIS Dashboard.
 * Combines MapLibre GL base map, deck.gl HexagonLayer (2.5D hazard extrusion),
 * deck.gl GeoJsonLayer for IMBL maritime boundary demarcation,
 * and interactive map click geographic coordinate selection.
 */
export function MarineMap({
  hazardData,
  hazards,
  boundaryGeoJson,
  imblData,
  initialViewState = DEFAULT_MARINE_VIEWPORT,
  onLocationSelect,
  mapStyle = DEFAULT_MAP_STYLE,
  className = "",
  hexagonRadius = 3000,
  elevationScale = 120,
  showControls = true,
}: MarineMapProps) {
  // SSR mounting guard to prevent WebGL context execution on server
  const [isMounted, setIsMounted] = useState<boolean>(false);

  // Active camera view state
  const [viewState, setViewState] = useState<MarineMapViewState>({
    ...DEFAULT_MARINE_VIEWPORT,
    ...initialViewState,
  });

  // Internal state for last clicked/selected geographic coordinate
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lon: number } | null>(
    null
  );

  // Container and map instance refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);

  // Active hazard dataset
  const activeHazards = useMemo(() => {
    return hazardData || hazards || DEFAULT_SEA_HAZARDS;
  }, [hazardData, hazards]);

  // Active boundary GeoJSON dataset (defaults to sample demo IMBL data)
  const activeBoundary = useMemo(() => {
    return boundaryGeoJson || imblData || SAMPLE_PALK_BAY_IMBL_GEOJSON;
  }, [boundaryGeoJson, imblData]);

  // Flag mount status on client
  useEffect(() => {
    setIsMounted(true);
    return () => {
      setIsMounted(false);
    };
  }, []);

  // Initialize MapLibre GL base map instance
  useEffect(() => {
    if (!isMounted || !mapContainerRef.current || mapInstanceRef.current) return;

    try {
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: mapStyle as maplibregl.StyleSpecification | string,
        center: [viewState.longitude, viewState.latitude],
        zoom: viewState.zoom,
        pitch: viewState.pitch,
        bearing: viewState.bearing,
        interactive: false, // Gesture handling driven by DeckGL controller
        attributionControl: false,
      });

      mapInstanceRef.current = map;

      map.on("error", (e: maplibregl.ErrorEvent) => {
        console.warn("MapLibre GL notice:", e);
      });
    } catch (err) {
      console.error("Failed to initialize MapLibre GL map:", err);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted, mapStyle]);

  // Synchronize MapLibre camera with DeckGL viewState changes
  const handleViewStateChange = useCallback(
    (params: ViewStateChangeParameters) => {
      const newViewState = params.viewState as unknown as Partial<MarineMapViewState>;
      const updatedViewState: MarineMapViewState = {
        latitude: newViewState.latitude ?? DEFAULT_MARINE_VIEWPORT.latitude,
        longitude: newViewState.longitude ?? DEFAULT_MARINE_VIEWPORT.longitude,
        zoom: newViewState.zoom ?? DEFAULT_MARINE_VIEWPORT.zoom,
        pitch: newViewState.pitch ?? DEFAULT_MARINE_VIEWPORT.pitch,
        bearing: newViewState.bearing ?? DEFAULT_MARINE_VIEWPORT.bearing,
        maxZoom: DEFAULT_MARINE_VIEWPORT.maxZoom,
        minZoom: DEFAULT_MARINE_VIEWPORT.minZoom,
        maxPitch: DEFAULT_MARINE_VIEWPORT.maxPitch,
        minPitch: DEFAULT_MARINE_VIEWPORT.minPitch,
      };

      setViewState(updatedViewState);

      if (mapInstanceRef.current) {
        mapInstanceRef.current.jumpTo({
          center: [updatedViewState.longitude, updatedViewState.latitude],
          zoom: updatedViewState.zoom,
          pitch: updatedViewState.pitch,
          bearing: updatedViewState.bearing,
        });
      }
    },
    []
  );

  // Map click handler to extract geographic coordinates { lat, lon }
  const handleMapClick = useCallback(
    (info: PickingInfo) => {
      if (!info.coordinate) return;
      const [lon, lat] = info.coordinate;
      const location = {
        lat: Number(lat.toFixed(6)),
        lon: Number(lon.toFixed(6)),
      };

      setSelectedLocation(location);

      if (onLocationSelect) {
        onLocationSelect(location);
      }
    },
    [onLocationSelect]
  );

  // Reset view state to default Palk Bay center
  const handleResetView = useCallback(() => {
    const targetState: MarineMapViewState = {
      ...DEFAULT_MARINE_VIEWPORT,
      ...initialViewState,
    };
    setViewState(targetState);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.easeTo({
        center: [targetState.longitude, targetState.latitude],
        zoom: targetState.zoom,
        pitch: targetState.pitch,
        bearing: targetState.bearing,
        duration: 800,
      });
    }
  }, [initialViewState]);

  // Memoized hardware-accelerated DeckGL layers (3D HexagonLayer + IMBL GeoJsonLayer)
  const layers = useMemo(() => {
    const layerList = [];

    // 1. 2.5D Hazard Hexagon Layer
    if (activeHazards && activeHazards.length > 0) {
      layerList.push(
        new HexagonLayer<SeaHazard>({
          id: "hazard-hexagon-layer",
          data: activeHazards,
          pickable: true,
          extruded: true,
          radius: hexagonRadius,
          elevationScale: elevationScale,
          getPosition: (d: SeaHazard) => [d.lon, d.lat],
          getElevationValue: (points: SeaHazard[]) => {
            if (!points || points.length === 0) return 0;
            return Math.max(
              ...points.map((p) => {
                const val = p.risk_level ?? 0;
                return val > 1.0 ? Math.min(val / 10, 1.0) : Math.min(Math.max(val, 0), 1.0);
              })
            );
          },
          getColorValue: (points: SeaHazard[]) => {
            if (!points || points.length === 0) return 0;
            return Math.max(
              ...points.map((p) => {
                const val = p.risk_level ?? 0;
                return val > 1.0 ? Math.min(val / 10, 1.0) : Math.min(Math.max(val, 0), 1.0);
              })
            );
          },
          colorRange: HAZARD_COLOR_RANGE,
          elevationRange: [100, 5000],
          elevationDomain: [0, 1],
          colorDomain: [0, 1],
          opacity: 0.85,
          material: {
            ambient: 0.35,
            diffuse: 0.6,
            shininess: 32,
            specularColor: [255, 255, 255],
          },
          updateTriggers: {
            getElevationValue: [activeHazards],
            getColorValue: [activeHazards],
          },
        })
      );
    }

    // 2. Maritime Boundary Line (IMBL) GeoJsonLayers (Glow Halo + Core Line)
    if (activeBoundary) {
      // Glow halo background layer for high visibility above 3D terrain/columns
      layerList.push(
        new GeoJsonLayer({
          id: "imbl-glow-layer",
          data: activeBoundary as unknown as string,
          pickable: false,
          stroked: true,
          filled: false,
          lineWidthUnits: "pixels",
          lineWidthMinPixels: 6,
          getLineWidth: 7,
          getLineColor: [255, 30, 60, 90], // Translucent glowing crimson halo
          parameters: {
            depthTest: false, // Ensures boundary renders prominently over 3D columns
          },
        })
      );

      // Sharp Core IMBL demarcation line
      layerList.push(
        new GeoJsonLayer({
          id: "imbl-boundary-layer",
          data: activeBoundary as unknown as string,
          pickable: true,
          stroked: true,
          filled: false,
          lineWidthUnits: "pixels",
          lineWidthMinPixels: 2.5,
          getLineWidth: 3,
          getLineColor: [255, 45, 75, 255], // Intense bright red
          getPointRadius: 4,
          pointRadiusMinPixels: 3,
          getFillColor: [255, 45, 75, 255],
          parameters: {
            depthTest: false, // Ensures boundary renders prominently over 3D columns
          },
        })
      );
    }

    return layerList;
  }, [activeHazards, activeBoundary, hexagonRadius, elevationScale]);

  // SSR Fallback container before client hydration
  if (!isMounted) {
    return (
      <div
        className={`w-full h-full min-h-[480px] bg-slate-950 flex flex-col items-center justify-center text-slate-400 p-6 rounded-xl border border-slate-800/80 ${className}`}
      >
        <div className="w-10 h-10 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin mb-4" />
        <span className="text-sm font-semibold tracking-wider text-slate-200 uppercase">
          Initializing Maritime 2.5D Engine...
        </span>
        <span className="text-xs text-slate-500 mt-1">
          Palk Bay / Coastal Tamil Nadu (9.28° N, 79.31° E)
        </span>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full h-full min-h-[500px] overflow-hidden rounded-xl border border-slate-800 bg-slate-950 select-none ${className}`}
    >
      {/* Base MapLibre GL Container */}
      <div
        ref={mapContainerRef}
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: "none" }}
      />

      {/* Deck.gl Interactive Overlay with HexagonLayer & GeoJsonLayer */}
      <DeckGL
        viewState={viewState}
        onViewStateChange={handleViewStateChange}
        onClick={handleMapClick}
        controller={{
          doubleClickZoom: true,
          dragPan: true,
          dragRotate: true,
          scrollZoom: true,
          touchRotate: true,
          keyboard: true,
        }}
        layers={layers}
        getCursor={({ isHovering, isDragging }) =>
          isDragging ? "grabbing" : isHovering ? "crosshair" : "crosshair"
        }
      />

      {/* Optional Selected Location HUD Feedback Badge (Bottom Left) */}
      {selectedLocation && (
        <div className="absolute bottom-4 left-4 z-10 bg-slate-900/90 border border-cyan-500/40 backdrop-blur-md rounded-lg px-3 py-2 text-xs font-mono text-cyan-300 shadow-xl flex items-center gap-2.5 pointer-events-auto">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">
              Selected Target
            </div>
            <div className="font-bold text-slate-100">
              {selectedLocation.lat.toFixed(4)}° N, {selectedLocation.lon.toFixed(4)}° E
            </div>
          </div>
        </div>
      )}

      {/* HUD Navigation Info Overlay */}
      {showControls && (
        <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2 pointer-events-none">
          <div className="bg-slate-900/90 border border-slate-700/70 backdrop-blur-md rounded-lg p-2.5 shadow-2xl text-[11px] font-mono text-slate-300 flex flex-col gap-1 min-w-[210px]">
            <div className="flex items-center justify-between text-cyan-400 font-semibold border-b border-slate-800 pb-1 text-[10px] tracking-wider uppercase">
              <span>VARUNA MARITIME HUD</span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                <span>ACTIVE</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Center:</span>
              <span className="text-slate-200">
                {viewState.latitude.toFixed(2)}°N, {viewState.longitude.toFixed(2)}°E
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Zoom / Pitch:</span>
              <span className="text-slate-200">
                z{viewState.zoom.toFixed(1)} / {Math.round(viewState.pitch)}°
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Bearing:</span>
              <span className="text-slate-200">{Math.round(viewState.bearing)}°</span>
            </div>
            <div className="flex justify-between border-t border-slate-800/80 pt-1 text-amber-300">
              <span className="text-slate-400">2.5D Hazards:</span>
              <span>{activeHazards.length} Points</span>
            </div>
            <div className="flex justify-between text-red-400">
              <span className="text-slate-400">IMBL Boundary:</span>
              <span className="font-semibold">ACTIVE RED LINE</span>
            </div>
          </div>

          <div className="pointer-events-auto">
            <button
              type="button"
              onClick={handleResetView}
              className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 shadow-lg transition-colors"
            >
              Reset View
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Dynamic SSR-safe default export for Next.js 14 consumers
 */
export default dynamic(() => Promise.resolve(MarineMap), {
  ssr: false,
});
