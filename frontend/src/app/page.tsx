"use client";

import React, { useState } from "react";
import MarineMap from "@/components/MarineMap";
import type { MarineCoordinates } from "@/types/marine";
import { DEMO_HAZARD_POINTS } from "@/data/mockMarineData";

export default function Home() {
  const [selectedCoord, setSelectedCoord] = useState<MarineCoordinates | null>({
    latitude: 9.28,
    longitude: 79.31,
  });

  const [activeAlert, setActiveAlert] = useState<string | null>(
    "Active Wave Advisory: 2.8m - 3.2m swells reported near Palk Strait shallow channels."
  );

  // Quick navigational target presets
  const TARGET_PRESETS = [
    {
      name: "Palk Bay Fishery Hotspot",
      lat: 9.28,
      lon: 79.31,
      tag: "OPTIMAL CATCH",
      desc: "High chlorophyll concentration, moderate sea state (1.2m)",
    },
    {
      name: "Adams Bridge Shallows",
      lat: 9.12,
      lon: 79.52,
      tag: "DANGER ZONE",
      desc: "Submerged limestone shoals; 3.4m wave chop; hazardous draft",
    },
    {
      name: "Point Calimere Headland",
      lat: 10.15,
      lon: 79.92,
      tag: "HIGH SWELL",
      desc: "Wave convergence zone with 23 knot onshore gusts",
    },
    {
      name: "Tuticorin Approach",
      lat: 8.75,
      lon: 78.6,
      tag: "CALM FAIRWAY",
      desc: "Safe transit fairway; wave height < 1.0m",
    },
  ];

  const handleLocationSelect = (coords: MarineCoordinates) => {
    setSelectedCoord(coords);
    setActiveAlert(
      `Target selected at ${coords.latitude.toFixed(4)}°N, ${coords.longitude.toFixed(4)}°E. Analyzing bathymetry & proximity to IMBL...`
    );
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Maritime Navigation Bar */}
      <header className="h-14 border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-md px-5 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center font-black text-white text-base shadow-lg shadow-cyan-500/20">
            V
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm tracking-wider uppercase text-slate-100">
                VARUNA <span className="text-cyan-400 font-mono text-xs">MOS</span>
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 rounded">
                v1.0-GIS
              </span>
            </div>
            <div className="text-[10px] text-slate-400 hidden sm:block">
              Visual Agentic Reasoning for Underwater Navigation & Advisory
            </div>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="hidden md:flex items-center gap-2 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/60">
            <span className="text-slate-400 text-[11px]">TECH:</span>
            <span className="text-cyan-300">MapLibre GL</span>
            <span className="text-slate-600">•</span>
            <span className="text-amber-300">deck.gl 2.5D</span>
            <span className="text-slate-600">•</span>
            <span className="text-red-400">IMBL GeoJSON</span>
          </div>

          <div className="flex items-center gap-1.5 bg-emerald-950/40 text-emerald-300 border border-emerald-800/50 px-2.5 py-1 rounded-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-[11px]">GIS OPERATIONAL</span>
          </div>
        </div>
      </header>

      {/* Main Command Room Dashboard Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Primary Interactive Maritime GIS Map Canvas */}
        <main className="flex-1 relative h-full w-full overflow-hidden p-2 bg-slate-950">
          <MarineMap
            selectedLocation={selectedCoord}
            onLocationSelect={handleLocationSelect}
            className="h-full w-full shadow-2xl"
          />
        </main>

        {/* Situational Awareness Telemetry Sidebar */}
        <aside className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-slate-800/80 bg-slate-900/95 backdrop-blur-md flex flex-col p-4 gap-3 shrink-0 overflow-y-auto max-h-[40vh] lg:max-h-full">
          {/* Active Advisory Banner */}
          {activeAlert && (
            <div className="p-3 rounded-lg bg-cyan-950/30 border border-cyan-500/30 text-xs">
              <div className="flex items-center justify-between text-cyan-400 font-bold uppercase text-[10px] tracking-wider mb-1">
                <span>Maritime Advisory</span>
                <span>LIVE</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">{activeAlert}</p>
            </div>
          )}

          {/* Selected Coordinate Inspector */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-col gap-2 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Location Inspector
              </span>
              <span className="text-[10px] text-cyan-400 font-mono">CLICK MAP TO PROBE</span>
            </div>

            {selectedCoord ? (
              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2 font-mono">
                  <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                    <div className="text-[10px] text-slate-400">LATITUDE</div>
                    <div className="text-cyan-300 font-bold text-sm">
                      {selectedCoord.latitude.toFixed(4)}° N
                    </div>
                  </div>
                  <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                    <div className="text-[10px] text-slate-400">LONGITUDE</div>
                    <div className="text-cyan-300 font-bold text-sm">
                      {selectedCoord.longitude.toFixed(4)}° E
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900/50 p-2.5 rounded border border-slate-800/80 text-[11px] text-slate-300 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Region:</span>
                    <span className="font-semibold text-slate-200">Palk Bay & Strait</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">IMBL Buffer:</span>
                    <span className="text-emerald-400 font-semibold">Clear of Line (3.8 NM)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Under-Keel Clearance:</span>
                    <span className="text-amber-300 font-semibold">Adequate (&gt; 4.2m)</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-xs text-slate-400 italic">
                Click anywhere on the map to inspect geographic coordinates.
              </div>
            )}
          </div>

          {/* Quick Target Presets */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Sector Navigation Presets
            </span>
            <div className="grid grid-cols-1 gap-1.5">
              {TARGET_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() =>
                    handleLocationSelect({ latitude: preset.lat, longitude: preset.lon })
                  }
                  className="text-left p-2.5 rounded-lg bg-slate-800/40 hover:bg-slate-800 border border-slate-700/40 hover:border-cyan-500/50 transition-all flex flex-col gap-1 text-xs group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200 group-hover:text-cyan-300">
                      {preset.name}
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold ${
                        preset.tag === "DANGER ZONE"
                          ? "bg-red-500/20 text-red-300 border border-red-500/40"
                          : preset.tag === "HIGH SWELL"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                          : preset.tag === "OPTIMAL CATCH"
                          ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                          : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      }`}
                    >
                      {preset.tag}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {preset.lat.toFixed(2)}°N, {preset.lon.toFixed(2)}°E
                  </div>
                  <div className="text-[10px] text-slate-400 leading-tight">{preset.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Active Hazard Summary Stats */}
          <div className="mt-auto p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs">
            <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">
              Telemetry Summary
            </div>
            <div className="grid grid-cols-3 gap-2 text-center font-mono">
              <div className="bg-slate-900 p-1.5 rounded border border-slate-800">
                <div className="text-[9px] text-slate-400">CLUSTERS</div>
                <div className="text-cyan-400 font-bold">{DEMO_HAZARD_POINTS.length}</div>
              </div>
              <div className="bg-slate-900 p-1.5 rounded border border-slate-800">
                <div className="text-[9px] text-slate-400">MAX SWELL</div>
                <div className="text-amber-400 font-bold">3.4 m</div>
              </div>
              <div className="bg-slate-900 p-1.5 rounded border border-slate-800">
                <div className="text-[9px] text-slate-400">IMBL SEGMENTS</div>
                <div className="text-red-400 font-bold">2</div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
