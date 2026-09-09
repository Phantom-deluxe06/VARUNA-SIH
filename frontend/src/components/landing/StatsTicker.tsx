"use client";

import { useTranslation } from "react-i18next";
import { usePolling } from "@/hooks/useApi";
import { getVesselStatus } from "@/lib/api";

export default function StatsTicker() {
  const { t } = useTranslation();
  const { data: s, error, loading } = usePolling("ticker-status", getVesselStatus, 60_000);

  const items = s
    ? [
        `SST: ${s.sst_celsius.toFixed(1)}°C`,
        `Wave: ${s.wave_height_m.toFixed(2)}m`,
        `Wind: ${s.wind_knots.toFixed(1)}kn`,
        `IMBL: ${s.imbl_distance_nm.toFixed(2)}NM`,
        `Status: ${s.status ?? "SAFE"}`,
        `Source: ${s.source}`,
      ]
    : ["Connecting…"];

  const row = (
    <div className="flex shrink-0 items-center gap-10 px-5">
      {items.map((item) => (
        <span key={item} className="text-small font-bold tracking-wide text-[#CAF0F8]">
          {item}
        </span>
      ))}
      {!loading && !error && <span className="text-small font-bold text-[#06D6A0]">VARUNA LIVE FEED ✓</span>}
    </div>
  );

  return (
    <div
      className="relative overflow-hidden border-y py-3.5"
      style={{ background: "#023E8A", borderColor: "rgba(144,224,239,0.2)" }}
      aria-label="Live marine statistics ticker"
    >
      <div className="pointer-events-none absolute left-0 top-0 z-10 flex h-full items-center gap-2 bg-[#023E8A] px-4">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2DC653] opacity-60" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-[#2DC653]" />
        </span>
        <span className="text-small font-extrabold tracking-widest text-[#2DC653]">{t("live_now").toUpperCase()}</span>
      </div>
      <div className="ticker-track pl-40" style={{ opacity: error && !s ? 0.4 : 1 }}>
        {row}
        {row}
      </div>
    </div>
  );
}
