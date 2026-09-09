"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ChevronUp, Crosshair, Search, Waves, X } from "lucide-react";
import ThemeToggle from "@/components/ui/ThemeToggle";
import LangToggle from "@/components/ui/LangToggle";
import { usePolling } from "@/hooks/useApi";
import { distanceToImblNm, getPfzLatest, getVesselStatus } from "@/lib/api";

const MarineMap = dynamic(() => import("@/components/map/MarineMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-[#03045E]" />,
});

interface PointInfo {
  lat: number;
  lon: number;
  sst: number | null;
  wave: number | null;
  imbl: number;
  pfzProb: number;
  loading: boolean;
}

export default function MapPage() {
  const { t } = useTranslation();
  const { data: status } = usePolling("map-status", getVesselStatus, 30_000);
  const { data: pfz } = usePolling("map-pfz", getPfzLatest, 300_000);
  const [selected, setSelected] = useState<PointInfo | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lon: number; zoom: number } | undefined>();

  const handlePointSelect = useCallback(
    async (p: { lat: number; lon: number }) => {
      const imbl = distanceToImblNm(p.lat, p.lon);
      const probe: PointInfo = { lat: p.lat, lon: p.lon, sst: null, wave: null, imbl, pfzProb: 0, loading: true };
      setSelected(probe);
      setPanelOpen(true);
      try {
        const res = await fetch(
          `https://marine-api.open-meteo.com/v1/marine?latitude=${p.lat.toFixed(3)}&longitude=${p.lon.toFixed(3)}&current=wave_height&hourly=sea_surface_temperature&forecast_days=1&timezone=auto`,
        );
        const j = (await res.json()) as {
          current?: { wave_height?: number };
          hourly?: { sea_surface_temperature?: (number | null)[] };
        };
        const sst = j.hourly?.sea_surface_temperature?.[0] ?? status?.sst_celsius ?? null;
        const wave = j.current?.wave_height ?? status?.wave_height_m ?? null;
        // Simple heuristic PFZ probability from SST (27–30°C optimum band)
        let prob = 0.25;
        if (sst != null) {
          const d = Math.abs(sst - 28.5);
          prob = Math.max(0.05, Math.min(0.95, 0.85 - d * 0.12));
        }
        setSelected({ lat: p.lat, lon: p.lon, sst, wave, imbl, pfzProb: prob, loading: false });
      } catch {
        setSelected({
          lat: p.lat,
          lon: p.lon,
          sst: status?.sst_celsius ?? null,
          wave: status?.wave_height_m ?? null,
          imbl,
          pfzProb: 0.25,
          loading: false,
        });
      }
    },
    [status],
  );

  const doSearch = async () => {
    if (!searchQ.trim() || searching) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(searchQ)}`,
      );
      const results = (await res.json()) as { lat: string; lon: string }[];
      if (results.length > 0) {
        const lat = parseFloat(results[0].lat);
        const lon = parseFloat(results[0].lon);
        setFlyTarget({ lat, lon, zoom: 11 });
      }
    } catch {
      /* search unavailable offline */
    } finally {
      setSearching(false);
    }
  };

  const myLocation = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setFlyTarget({ lat: pos.coords.latitude, lon: pos.coords.longitude, zoom: 13 }),
      () => undefined,
      { timeout: 8000 },
    );
  };

  return (
    <div className="relative h-screen w-full overflow-hidden">
      {/* Top overlay bar */}
      <div
        className="absolute inset-x-0 top-0 z-[600] flex flex-wrap items-center gap-2 px-3 py-2.5 backdrop-blur-md"
        style={{ background: "var(--nav-bg)", borderBottom: "1px solid var(--border)" }}
      >
        <Link href="/" className="flex items-center gap-2 font-extrabold" aria-label="Back to home">
          <Waves size={20} style={{ color: "#00B4D8" }} /> VARUNA
        </Link>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            doSearch();
          }}
          className="relative min-w-[160px] flex-1 sm:max-w-xs"
          role="search"
        >
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" size={15} style={{ color: "var(--muted)" }} />
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search location..."
            aria-label="Search location"
            className="v-input w-full py-2 pl-8 pr-3 text-small"
          />
        </form>

        <button
          onClick={myLocation}
          aria-label="My location"
          className="v-btn-primary flex h-9 items-center gap-1.5 px-3 text-small"
        >
          <Crosshair size={15} /> <span className="hidden sm:inline">My location</span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <LangToggle />
          <ThemeToggle />
          <Link href="/dashboard" className="hidden rounded-btn border px-3 py-1.5 text-small font-bold sm:block" style={{ borderColor: "var(--border)" }}>
            Dashboard
          </Link>
        </div>
      </div>

      {/* Full-screen map */}
      <div className="absolute inset-0">
        <MarineMap
          vessel={status}
          pfzZones={pfz?.zones ?? []}
          height="100%"
          zoom={8}
          onPointSelect={handlePointSelect}
          showControls
        />
      </div>

      {/* Bottom slide-up detail panel */}
      {selected && (
        <div
          className="absolute inset-x-0 bottom-0 z-[600] transition-transform duration-300"
          style={{ transform: panelOpen ? "translateY(0)" : "translateY(calc(100% - 64px))" }}
        >
          <div
            className="mx-auto max-w-2xl rounded-t-2xl border p-4 pb-8 shadow-hover"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <button
              className="mx-auto mb-3 flex h-8 w-12 items-center justify-center rounded-full"
              style={{ background: "var(--bg)" }}
              onClick={() => setPanelOpen((o) => !o)}
              aria-label={panelOpen ? "Collapse panel" : "Expand panel"}
            >
              <ChevronUp
                size={18}
                style={{ transform: panelOpen ? "none" : "rotate(180deg)", transition: "transform .3s" }}
              />
            </button>
            {panelOpen && (
              <button
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full"
                style={{ background: "var(--bg)" }}
                onClick={() => setSelected(null)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            )}

            <h2 className="text-center text-lg font-extrabold">
              {selected.lat.toFixed(4)}°N, {selected.lon.toFixed(4)}°E
            </h2>

            {selected.loading ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-xl bg-current opacity-10" />
                ))}
              </div>
            ) : (
              <>
                <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ["🌡️ SST", selected.sst != null ? `${selected.sst.toFixed(1)}°C` : "—"],
                    ["🌊 Wave", selected.wave != null ? `${selected.wave.toFixed(2)}m` : "—"],
                    ["🚨 IMBL", `${selected.imbl.toFixed(1)} NM`],
                    ["🐟 PFZ", `${Math.round(selected.pfzProb * 100)}%`],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl p-3 text-center" style={{ background: "var(--bg)" }}>
                      <dt className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
                        {k}
                      </dt>
                      <dd className="mt-1 text-lg font-extrabold">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 flex items-center justify-center gap-3">
                  <span className="text-small font-bold">{selected.pfzProb >= 0.5 ? "Fish here?" : "Fish here?"}</span>
                  <button className="v-btn-primary px-5 py-2 text-small" disabled={selected.pfzProb < 0.35} style={selected.pfzProb < 0.35 ? { filter: "grayscale(1)", opacity: 0.5 } : undefined}>
                    Yes 👍
                  </button>
                  <button className="v-btn-outline px-5 py-2 text-small">No 👎</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
