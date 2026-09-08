"use client";

import dynamic from "next/dynamic";
import React from "react";
import type { MarineMapProps } from "../types/marine";

/**
 * SSR-safe dynamic wrapper for MarineMap.
 * Disables Server-Side Rendering (SSR: false) to prevent `window is not defined`
 * or WebGL context errors during Next.js server pre-rendering.
 */
export const MarineMapClient = dynamic<MarineMapProps>(
  () => import("./MarineMap").then((mod) => mod.MarineMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[480px] bg-slate-950 flex flex-col items-center justify-center text-slate-400 p-6 rounded-xl border border-slate-800/80">
        <div className="w-10 h-10 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin mb-4" />
        <span className="text-sm font-semibold tracking-wider text-slate-200 uppercase">
          Initializing VARUNA Maritime WebGL Engine...
        </span>
        <span className="text-xs text-slate-400 mt-1">
          Loading MapLibre Bathymetry & deck.gl 2.5D Shaders
        </span>
      </div>
    ),
  }
);

export default MarineMapClient;
