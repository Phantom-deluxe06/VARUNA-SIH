"use client";

import React from "react";

export interface QueryPanelProps {
  /** Selected marine coordinate payload ({ lat, lon }) */
  selectedLocation?: {
    lat: number;
    lon: number;
  } | null;
  /** Custom class name */
  className?: string;
}

/**
 * QueryPanel Component for VARUNA Command Dashboard.
 * Receives selected coordinates from parent dashboard state and displays telemetry readout.
 */
export function QueryPanel({ selectedLocation, className = "" }: QueryPanelProps) {
  return (
    <div
      className={`p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-col gap-2 shadow-lg ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
          Location Inspector / Query Panel
        </span>
        <span className="text-[10px] text-cyan-400 font-mono">CLICK MAP TO PROBE</span>
      </div>

      {selectedLocation ? (
        <div className="space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2 font-mono">
            <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
              <div className="text-[10px] text-slate-400">LATITUDE</div>
              <div className="text-cyan-300 font-bold text-sm">
                {selectedLocation.lat.toFixed(6)}° N
              </div>
            </div>
            <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
              <div className="text-[10px] text-slate-400">LONGITUDE</div>
              <div className="text-cyan-300 font-bold text-sm">
                {selectedLocation.lon.toFixed(6)}° E
              </div>
            </div>
          </div>

          <div className="bg-slate-900/50 p-2.5 rounded border border-slate-800/80 text-[11px] text-slate-300 space-y-1 font-mono">
            <div className="flex justify-between">
              <span className="text-slate-400">Raw Payload:</span>
              <span className="text-slate-200">
                Lat: {selectedLocation.lat.toFixed(6)}, Lon: {selectedLocation.lon.toFixed(6)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Region:</span>
              <span className="font-semibold text-slate-200">Palk Bay & Strait</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="py-4 text-center text-xs text-slate-400 italic bg-slate-900/40 rounded border border-slate-800/60">
          Click on the map to select a marine location
        </div>
      )}
    </div>
  );
}

export default QueryPanel;
