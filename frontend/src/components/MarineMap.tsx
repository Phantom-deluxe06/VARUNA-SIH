"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import DeckGL from "@deck.gl/react";
import { HexagonLayer } from "@deck.gl/aggregation-layers";
import { GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { PickingInfo, ViewStateChangeParameters } from "@deck.gl/core";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type {
  HazardPoint,
  MarineCoordinates,
  MarineMapProps,
  MarineMapViewState,
} from "../types/marine";
import {
  DEFAULT_MARINE_VIEWPORT,
  DEMO_HAZARD_POINTS,
  SAMPLE_PALK_BAY_IMBL_GEOJSON,
} from "../data/mockMarineData";

// High-reliability self-contained dark maritime base map style
const DEFAULT_MARITIME_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    "carto-dark": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [
    {
      id: "carto-dark-layer",
      type: "raster",
      source: "carto-dark",
      minzoom: 0,
      maxzoom: 20,
    },
  ],
};

// High-contrast maritime risk color gradient: Emerald -> Cyan -> Amber -> Orange -> Crimson Red
const RISK_COLOR_RANGE: [number, number, number, number][] = [
  [16, 185, 129, 180], // Low Risk (Emerald)
  [6, 182, 212, 200],  // Mild Risk (Cyan)
  [245, 158, 11, 220], // Moderate Risk (Amber)
  [249, 115, 22, 235], // Elevated Risk (Orange)
  [239, 68, 68, 245],  // High Risk (Bright Red)
  [185, 28, 28, 255],  // Critical/Severe Risk (Deep Crimson)
];

/**
 * Production-quality MarineMap component for VARUNA Marine Operating System.
 * Combines MapLibre GL for base maritime bathymetry/landforms and Deck.gl
 * for 2.5D hexagonal wave/sea-state hazard extrusion and high-visibility IMBL demarcation.
 */
export function MarineMap({
  hazardData = DEMO_HAZARD_POINTS,
  imblData = SAMPLE_PALK_BAY_IMBL_GEOJSON,
  initialViewState = DEFAULT_MARINE_VIEWPORT,
  onLocationSelect,
  showLegend = true,
  showControls = true,
  mapStyle = DEFAULT_MARITIME_STYLE,
  className = "",
  hexagonRadius = 3200,
  elevationScale = 140,
  selectedLocation: externalSelectedLocation = null,
}: MarineMapProps) {
  // SSR mounting flag to guarantee zero WebGL invocation during server rendering
  const [isMounted, setIsMounted] = useState<boolean>(false);

  // Active camera view state
  const [viewState, setViewState] = useState<MarineMapViewState>({
    ...DEFAULT_MARINE_VIEWPORT,
    ...initialViewState,
  });

  // Internal selected location state (if not controlled externally)
  const [internalSelectedLocation, setInternalSelectedLocation] =
    useState<MarineCoordinates | null>(null);

  // Active selected location (prioritizing external prop if supplied)
  const activeSelectedLocation = externalSelectedLocation ?? internalSelectedLocation;

  // Layer visibility toggles
  const [showHazards, setShowHazards] = useState<boolean>(true);
  const [showImbl, setShowImbl] = useState<boolean>(true);
  const [is3DMode, setIs3DMode] = useState<boolean>(true);

  // Live cursor coordinate tracker for HUD
  const [hoverCoordinates, setHoverCoordinates] = useState<MarineCoordinates | null>(null);

  // Refs for MapLibre container and map instance
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);

  // Mount guard for SSR safety
  useEffect(() => {
    setIsMounted(true);
    return () => {
      setIsMounted(false);
    };
  }, []);

  // Initialize MapLibre GL base map
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
        interactive: false, // DeckGL handles user gesture controls
        attributionControl: false,
      });

      mapInstanceRef.current = map;

      map.on("error", (e: maplibregl.ErrorEvent) => {
        console.warn("MapLibre GL non-fatal load notice:", e);
      });
    } catch (err) {
      console.error("Failed to initialize MapLibre GL base map:", err);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted, mapStyle]);

  // Synchronize MapLibre camera when DeckGL viewState changes
  const handleViewStateChange = useCallback(
    (params: ViewStateChangeParameters) => {
      const newViewState = params.viewState as unknown as Partial<MarineMapViewState>;
      const typedViewState: MarineMapViewState = {
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

      setViewState(typedViewState);

      if (mapInstanceRef.current) {
        mapInstanceRef.current.jumpTo({
          center: [typedViewState.longitude, typedViewState.latitude],
          zoom: typedViewState.zoom,
          pitch: typedViewState.pitch,
          bearing: typedViewState.bearing,
        });
      }
    },
    []
  );

  // Reset to initial Palk Bay viewport
  const handleResetViewport = useCallback(() => {
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
        duration: 1000,
      });
    }
  }, [initialViewState]);

  // Toggle 2D flat vs 2.5D perspective mode
  const handleToggle3D = useCallback(() => {
    setIs3DMode((prev) => {
      const nextMode = !prev;
      setViewState((current) => {
        const updated = {
          ...current,
          pitch: nextMode ? 45 : 0,
          bearing: nextMode ? -15 : 0,
        };
        if (mapInstanceRef.current) {
          mapInstanceRef.current.easeTo({
            pitch: updated.pitch,
            bearing: updated.bearing,
            duration: 800,
          });
        }
        return updated;
      });
      return nextMode;
    });
  }, []);

  // Map click handler for geographic location selection
  const handleMapClick = useCallback(
    (info: PickingInfo) => {
      if (!info.coordinate) return;
      const [lon, lat] = info.coordinate;
      const coordinates: MarineCoordinates = {
        latitude: parseFloat(lat.toFixed(5)),
        longitude: parseFloat(lon.toFixed(5)),
      };

      setInternalSelectedLocation(coordinates);

      if (onLocationSelect) {
        onLocationSelect(coordinates);
      }
    },
    [onLocationSelect]
  );

  // DeckGL hover tracker for coordinate readout
  const handleHover = useCallback((info: PickingInfo) => {
    if (info.coordinate) {
      setHoverCoordinates({
        latitude: parseFloat(info.coordinate[1].toFixed(4)),
        longitude: parseFloat(info.coordinate[0].toFixed(4)),
      });
    } else {
      setHoverCoordinates(null);
    }
  }, []);

  // Construct Deck.gl visual layers with performance memoization
  const layers = useMemo(() => {
    const layerList = [];

    // 1. 2.5D Hazard Hexagon Layer (Wave hazards, Sea-state risk & Operational risk)
    if (showHazards && hazardData && hazardData.length > 0) {
      layerList.push(
        new HexagonLayer<HazardPoint>({
          id: "hazard-hexagon-layer",
          data: hazardData,
          pickable: true,
          extruded: is3DMode,
          radius: hexagonRadius,
          elevationScale: is3DMode ? elevationScale : 0,
          getPosition: (d: HazardPoint) => [d.lon, d.lat],
          getElevationValue: (points: HazardPoint[]) => {
            if (!points || points.length === 0) return 0;
            // Max risk level for high-visibility risk peak columns
            return points.reduce((max, p) => Math.max(max, p.risk_level), 0);
          },
          getColorValue: (points: HazardPoint[]) => {
            if (!points || points.length === 0) return 0;
            return points.reduce((max, p) => Math.max(max, p.risk_level), 0);
          },
          colorRange: RISK_COLOR_RANGE,
          elevationRange: [100, 6000],
          elevationDomain: [0, 10],
          colorDomain: [0, 10],
          opacity: 0.85,
          material: {
            ambient: 0.35,
            diffuse: 0.6,
            shininess: 32,
            specularColor: [255, 255, 255],
          },
          transitions: {
            elevationScale: 400,
          },
          updateTriggers: {
            extruded: is3DMode,
            elevationScale: is3DMode ? elevationScale : 0,
          },
        })
      );
    }

    // 2. International Maritime Boundary Line (IMBL) Layers (Glowing Red Demarcation)
    if (showImbl && imblData) {
      // Glow/Halo background layer for high-visibility demarcation
      layerList.push(
        new GeoJsonLayer({
          id: "imbl-glow-layer",
          data: imblData,
          pickable: false,
          stroked: true,
          filled: false,
          lineWidthUnits: "pixels",
          lineWidthMinPixels: 6,
          getLineWidth: 7,
          getLineColor: [255, 20, 60, 80], // Translucent glowing crimson halo
          parameters: {
            depthTest: false,
          },
        })
      );

      // Sharp Core IMBL demarcation line
      layerList.push(
        new GeoJsonLayer({
          id: "imbl-core-layer",
          data: imblData,
          pickable: true,
          stroked: true,
          filled: false,
          lineWidthUnits: "pixels",
          lineWidthMinPixels: 2.5,
          getLineWidth: 3,
          getLineColor: [255, 45, 75, 245], // Intense high-visibility crimson
          getPointRadius: 4,
          pointRadiusMinPixels: 3,
          getFillColor: [255, 45, 75, 255],
          parameters: {
            depthTest: false,
          },
        })
      );
    }

    // 3. Selected Location Ping Marker (Glowing cyan target radar ring)
    if (activeSelectedLocation) {
      layerList.push(
        new ScatterplotLayer({
          id: "selected-location-pulse-ring",
          data: [activeSelectedLocation],
          pickable: false,
          getPosition: (d: MarineCoordinates) => [d.longitude, d.latitude],
          getRadius: 2800,
          stroked: true,
          filled: true,
          getFillColor: [6, 182, 212, 40],
          getLineColor: [6, 182, 212, 220],
          lineWidthMinPixels: 2,
          radiusMinPixels: 14,
        }),
        new ScatterplotLayer({
          id: "selected-location-core-pin",
          data: [activeSelectedLocation],
          pickable: false,
          getPosition: (d: MarineCoordinates) => [d.longitude, d.latitude],
          getRadius: 800,
          stroked: true,
          filled: true,
          getFillColor: [6, 182, 212, 255],
          getLineColor: [255, 255, 255, 255],
          lineWidthMinPixels: 2,
          radiusMinPixels: 5,
        })
      );
    }

    return layerList;
  }, [
    showHazards,
    hazardData,
    is3DMode,
    hexagonRadius,
    elevationScale,
    showImbl,
    imblData,
    activeSelectedLocation,
  ]);

  // Tooltip formatter for Deck.gl picking
  const getTooltip = useCallback((info: PickingInfo) => {
    if (!info.object) {
      if (info.coordinate) {
        return {
          html: `
            <div class="px-2.5 py-1.5 text-xs bg-slate-900/95 text-slate-200 border border-slate-700/80 rounded-md shadow-xl backdrop-blur-md">
              <div class="text-[10px] text-cyan-400 font-semibold tracking-wider uppercase">Maritime Coordinates</div>
              <div class="font-mono text-slate-100">${info.coordinate[1].toFixed(4)}° N, ${info.coordinate[0].toFixed(4)}° E</div>
              <div class="text-[10px] text-slate-400 mt-0.5">Click to inspect location</div>
            </div>
          `,
          style: {
            backgroundColor: "transparent",
            padding: "0px",
          },
        };
      }
      return null;
    }

    // Hexagon Layer Hover
    if (info.layer?.id === "hazard-hexagon-layer") {
      const hex = info.object as {
        points?: HazardPoint[];
        colorValue?: number;
        elevationValue?: number;
      };
      const points = hex.points || [];
      const count = points.length;
      const maxRisk = points.reduce((m, p) => Math.max(m, p.risk_level), 0);
      const avgWave =
        points.filter((p) => p.wave_height_m).reduce((s, p) => s + (p.wave_height_m || 0), 0) /
        (points.filter((p) => p.wave_height_m).length || 1);
      const avgWind =
        points.filter((p) => p.wind_speed_knots).reduce((s, p) => s + (p.wind_speed_knots || 0), 0) /
        (points.filter((p) => p.wind_speed_knots).length || 1);

      const riskLabel =
        maxRisk >= 8.5
          ? "CRITICAL DANGER"
          : maxRisk >= 7.0
          ? "HIGH RISK"
          : maxRisk >= 5.0
          ? "MODERATE RISK"
          : "LOW RISK";

      const riskBadgeClass =
        maxRisk >= 8.5
          ? "bg-red-500/20 text-red-300 border-red-500/40"
          : maxRisk >= 7.0
          ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
          : maxRisk >= 5.0
          ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/40"
          : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";

      return {
        html: `
          <div class="p-3 text-xs bg-slate-900/95 text-slate-200 border border-slate-700/80 rounded-lg shadow-2xl backdrop-blur-md min-w-[200px]">
            <div class="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-slate-800">
              <span class="font-bold tracking-wider text-slate-100 uppercase text-[11px]">2.5D Hazard Cell</span>
              <span class="px-1.5 py-0.5 text-[10px] font-semibold rounded border ${riskBadgeClass}">
                ${riskLabel} (${maxRisk.toFixed(1)}/10)
              </span>
            </div>
            <div class="space-y-1 font-mono text-[11px] text-slate-300">
              <div class="flex justify-between"><span class="text-slate-400">Aggregated Clusters:</span> <span class="text-cyan-300 font-semibold">${count}</span></div>
              <div class="flex justify-between"><span class="text-slate-400">Avg Wave Height:</span> <span class="text-amber-300 font-semibold">${avgWave ? avgWave.toFixed(1) + " m" : "N/A"}</span></div>
              <div class="flex justify-between"><span class="text-slate-400">Avg Wind Speed:</span> <span class="text-sky-300 font-semibold">${avgWind ? avgWind.toFixed(0) + " kts" : "N/A"}</span></div>
            </div>
            ${
              points[0]?.description
                ? `<div class="mt-2 text-[10px] text-slate-400 border-t border-slate-800/80 pt-1.5 italic">${points[0].description}</div>`
                : ""
            }
          </div>
        `,
        style: {
          backgroundColor: "transparent",
          padding: "0px",
        },
      };
    }

    // IMBL Boundary Line Hover
    if (info.layer?.id === "imbl-core-layer" || info.layer?.id === "imbl-glow-layer") {
      const feature = info.object as { properties?: Record<string, unknown> };
      const name =
        (feature?.properties?.name as string) || "International Maritime Boundary Line (IMBL)";
      const desc =
        (feature?.properties?.description as string) ||
        "India — Sri Lanka Maritime Boundary Demarcation (Palk Bay Segment)";

      return {
        html: `
          <div class="p-3 text-xs bg-slate-900/95 text-slate-200 border border-red-500/40 rounded-lg shadow-2xl backdrop-blur-md max-w-xs">
            <div class="flex items-center gap-1.5 mb-1 text-red-400 font-bold uppercase text-[11px] tracking-wide">
              <span class="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              ${name}
            </div>
            <p class="text-[11px] text-slate-300 leading-relaxed">${desc}</p>
            <div class="mt-2 text-[10px] text-red-400/90 font-mono bg-red-950/40 px-2 py-1 rounded border border-red-900/50">
              RESTRICTED PERIMETER • 0.5 NM BUFFER ACTIVE
            </div>
          </div>
        `,
        style: {
          backgroundColor: "transparent",
          padding: "0px",
        },
      };
    }

    return null;
  }, []);

  // Guard against server-side rendering
  if (!isMounted) {
    return (
      <div
        className={`w-full h-full min-h-[480px] bg-slate-950 flex flex-col items-center justify-center text-slate-400 p-6 rounded-xl border border-slate-800/80 ${className}`}
      >
        <div className="w-10 h-10 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin mb-4" />
        <span className="text-sm font-semibold tracking-wider text-slate-200 uppercase">
          Initializing Maritime WebGL Engine...
        </span>
        <span className="text-xs text-slate-400 mt-1">
          Loading MapLibre Bathymetry & deck.gl 2.5D Shaders
        </span>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full h-full min-h-[500px] overflow-hidden rounded-xl border border-slate-800 bg-slate-950 select-none ${className}`}
    >
      {/* MapLibre GL Base Map Container */}
      <div
        ref={mapContainerRef}
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: "none" }}
      />

      {/* Deck.gl WebGL Canvas Overlay */}
      <DeckGL
        viewState={viewState}
        onViewStateChange={handleViewStateChange}
        controller={{
          doubleClickZoom: true,
          dragPan: true,
          dragRotate: true,
          scrollZoom: true,
          touchRotate: true,
          keyboard: true,
        }}
        layers={layers}
        onClick={handleMapClick}
        onHover={handleHover}
        getTooltip={getTooltip}
        getCursor={({ isHovering, isDragging }) =>
          isDragging ? "grabbing" : isHovering ? "crosshair" : "default"
        }
      />

      {/* Live Coordinate & Telemetry HUD Overlay (Top Right) */}
      {showControls && (
        <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2 pointer-events-none">
          {/* Compass / Camera Stats */}
          <div className="bg-slate-900/90 border border-slate-700/70 backdrop-blur-md rounded-lg p-2.5 shadow-2xl text-[11px] font-mono text-slate-300 flex flex-col gap-1 min-w-[190px]">
            <div className="flex items-center justify-between text-cyan-400 font-semibold border-b border-slate-800 pb-1 text-[10px] tracking-wider uppercase">
              <span>VARUNA GIS HUD</span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                <span>ONLINE</span>
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
            {hoverCoordinates && (
              <div className="flex justify-between border-t border-slate-800/80 pt-1 text-cyan-300">
                <span className="text-slate-400">Cursor:</span>
                <span>
                  {hoverCoordinates.latitude.toFixed(3)}°N, {hoverCoordinates.longitude.toFixed(3)}°E
                </span>
              </div>
            )}
          </div>

          {/* Interactive View Controls (Pointer enabled) */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-700/70 backdrop-blur-md p-1.5 rounded-lg shadow-xl pointer-events-auto">
            <button
              type="button"
              onClick={handleToggle3D}
              title="Toggle 2.5D Extrusion / 2D Top-Down"
              className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                is3DMode
                  ? "bg-cyan-600/90 text-white shadow-sm"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {is3DMode ? "2.5D View" : "2D View"}
            </button>
            <button
              type="button"
              onClick={handleResetViewport}
              title="Reset Viewport to Palk Bay Operational Center"
              className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              Reset Center
            </button>
          </div>
        </div>
      )}

      {/* Layer Visibility Quick Filters (Top Left) */}
      <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={() => setShowHazards((prev) => !prev)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border backdrop-blur-md transition-all shadow-lg ${
            showHazards
              ? "bg-slate-900/90 border-amber-500/50 text-amber-300 shadow-amber-500/10"
              : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${showHazards ? "bg-amber-400" : "bg-slate-600"}`}
          />
          <span>2.5D Risk Hexagons</span>
        </button>

        <button
          type="button"
          onClick={() => setShowImbl((prev) => !prev)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border backdrop-blur-md transition-all shadow-lg ${
            showImbl
              ? "bg-slate-900/90 border-red-500/50 text-red-300 shadow-red-500/10"
              : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${showImbl ? "bg-red-500 animate-pulse" : "bg-slate-600"}`}
          />
          <span>IMBL Maritime Line</span>
        </button>
      </div>

      {/* Selected Location Bottom Action Banner */}
      {activeSelectedLocation && (
        <div className="absolute bottom-4 left-4 right-4 sm:right-auto z-10 bg-slate-900/95 border border-cyan-500/40 backdrop-blur-lg rounded-xl p-3 shadow-2xl flex flex-wrap items-center justify-between gap-3 text-xs pointer-events-auto max-w-md">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold">
              📍
            </div>
            <div>
              <div className="text-[10px] text-cyan-400 font-semibold tracking-wider uppercase">
                Selected Coordinates
              </div>
              <div className="font-mono text-slate-100 font-medium">
                {activeSelectedLocation.latitude.toFixed(4)}° N,{" "}
                {activeSelectedLocation.longitude.toFixed(4)}° E
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setInternalSelectedLocation(null)}
            className="text-[11px] text-slate-400 hover:text-slate-200 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            Clear Pin
          </button>
        </div>
      )}

      {/* Maritime Legend & Risk Intensity Scale (Bottom Right) */}
      {showLegend && (
        <div className="absolute bottom-4 right-4 z-10 bg-slate-900/95 border border-slate-700/80 backdrop-blur-md rounded-xl p-3 shadow-2xl text-xs text-slate-300 max-w-[260px] pointer-events-auto">
          <div className="text-[11px] font-bold text-slate-100 uppercase tracking-wider pb-1.5 border-b border-slate-800 flex items-center justify-between">
            <span>Maritime GIS Legend</span>
            <span className="text-[10px] text-cyan-400 font-mono">Palk Bay</span>
          </div>

          {/* Hexagon Risk Intensity Color Bar */}
          <div className="mt-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>Wave & Sea Risk (2.5D)</span>
              <span>Low → Severe</span>
            </div>
            <div className="h-2 w-full rounded-sm overflow-hidden flex bg-slate-800">
              <div className="h-full flex-1 bg-emerald-500" title="Low Risk" />
              <div className="h-full flex-1 bg-cyan-500" title="Mild Risk" />
              <div className="h-full flex-1 bg-amber-500" title="Moderate Risk" />
              <div className="h-full flex-1 bg-orange-500" title="Elevated Risk" />
              <div className="h-full flex-1 bg-red-500" title="High Risk" />
              <div className="h-full flex-1 bg-red-700" title="Critical Risk" />
            </div>
            <div className="flex justify-between text-[9px] text-slate-400 font-mono">
              <span>0.0</span>
              <span>Column Height = Risk Level</span>
              <span>10.0</span>
            </div>
          </div>

          {/* Demarcation Indicators */}
          <div className="mt-3 pt-2 border-t border-slate-800/80 space-y-1.5 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="w-4 h-0.5 bg-red-500 rounded shadow-[0_0_8px_rgba(239,68,68,0.8)] inline-block" />
              <span className="text-slate-200">IMBL (Border Demarcation)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full border-2 border-cyan-400 bg-cyan-500/30 inline-block" />
              <span className="text-slate-200">Selected Target Pin</span>
            </div>
          </div>

          {/* Disclaimer notice */}
          <div className="mt-2 pt-1.5 border-t border-slate-800/60 text-[9px] text-slate-400 leading-tight">
            * IMBL representation for simulation & advisory use. Official gazetted GeoJSON can be supplied via props.
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Dynamic SSR-safe export for Next.js 14 consumers
 */
export default dynamic(() => Promise.resolve(MarineMap), {
  ssr: false,
});
