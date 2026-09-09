"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Fish, ShieldAlert, Waves } from "lucide-react";
import { useTranslation } from "react-i18next";
import { timeAgo } from "@/lib/utils";

export interface TimelineAlert {
  id: number;
  time: number; // epoch ms
  type: "IMBL" | "Weather" | "PFZ" | "Safety";
  severity: "SAFE" | "CAUTION" | "CRITICAL";
  message: string;
}

const ICONS: Record<TimelineAlert["type"], typeof AlertTriangle> = {
  IMBL: ShieldAlert,
  Weather: Waves,
  PFZ: Fish,
  Safety: AlertTriangle,
};

const SEV_COLOR = { SAFE: "#2DC653", CAUTION: "#FFB703", CRITICAL: "#EF233C" } as const;

export default function AlertsTimeline({ alerts }: { alerts: TimelineAlert[] }) {
  const { t } = useTranslation();
  return (
    <div className="v-card overflow-hidden">
      <div className="border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-base font-bold">🔔 {t("marine_alerts")}</h2>
      </div>
      <ol className="max-h-[320px] space-y-1 overflow-y-auto p-3">
        {alerts.length === 0 && (
          <li className="px-4 py-6 text-center text-small" style={{ color: "var(--muted)" }}>
            No alerts — all clear.
          </li>
        )}
        {alerts.map((a) => {
          const Icon = ICONS[a.type];
          const color = SEV_COLOR[a.severity];
          return (
            <motion.li
              key={a.id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-start gap-3 rounded-xl p-3"
              style={{ background: "var(--bg)" }}
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}22`, color }}>
                <Icon size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color }}>
                    {a.type} · {a.severity}
                  </span>
                  <time className="shrink-0 text-xs" style={{ color: "var(--muted)" }}>
                    {timeAgo(a.time)}
                  </time>
                </div>
                <p className="mt-1 break-words text-small">{a.message}</p>
              </div>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
