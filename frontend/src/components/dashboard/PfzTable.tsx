"use client";

import { useTranslation } from "react-i18next";
import { usePolling } from "@/hooks/useApi";
import { getPfzLatest, type PfzZone } from "@/lib/api";
import { bearingToCardinal, timeAgo } from "@/lib/utils";

export default function PfzTable() {
  const { t } = useTranslation();
  const { data, loading, error, updatedAt } = usePolling("pfz-latest", getPfzLatest, 300_000);

  return (
    <div id="pfz" className="v-card overflow-hidden">
      <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-h3 text-base font-bold">🐟 {t("fishing_zones")}</h2>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {error ? (
            <span style={{ color: "#EF233C" }}>⚠ {t("error_api")}</span>
          ) : updatedAt ? (
            `Updated ${timeAgo(updatedAt)}`
          ) : loading ? (
            "Updating…"
          ) : null}
        </span>
      </div>
      {loading && !data ? (
        <div className="space-y-3 p-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-current opacity-10" />
          ))}
        </div>
      ) : (
        <table className="w-full text-small">
          <thead>
            <tr className="text-left" style={{ color: "var(--muted)" }}>
              <th className="px-5 py-3 font-semibold">Zone</th>
              <th className="px-5 py-3 font-semibold">Distance</th>
              <th className="px-5 py-3 font-semibold">Bearing</th>
              <th className="px-5 py-3 font-semibold">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {(data?.zones ?? []).map((z: PfzZone, i: number) => (
              <tr key={i} className="border-t transition-colors hover:bg-[#00B4D8]/5" style={{ borderColor: "var(--border)" }}>
                <td className="px-5 py-3 font-semibold">PFZ-{String(i + 1).padStart(2, "0")}</td>
                <td className="px-5 py-3">{z.distance_nm.toFixed(1)} NM</td>
                <td className="px-5 py-3">
                  {z.bearing.toFixed(0)}° {bearingToCardinal(z.bearing)}
                </td>
                <td className="px-5 py-3">
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-extrabold"
                    style={{
                      background: z.confidence >= 0.7 ? "rgba(45,198,83,0.15)" : "rgba(255,183,3,0.15)",
                      color: z.confidence >= 0.7 ? "#2DC653" : "#FFB703",
                    }}
                  >
                    {(z.confidence * 100).toFixed(0)}%
                  </span>
                </td>
              </tr>
            ))}
            {data && data.zones.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-center" style={{ color: "var(--muted)" }}>
                  No active fishing zones right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
