"use client";

import { motion } from "framer-motion";
import type { AlertLevel } from "@/lib/api";

const STYLES: Record<AlertLevel, { bg: string; border: string; text: string }> = {
  SAFE: {
    bg: "linear-gradient(90deg, rgba(45,198,83,0.22), rgba(45,198,83,0.05))",
    border: "#2DC653",
    text: "#2DC653",
  },
  CAUTION: {
    bg: "linear-gradient(90deg, rgba(255,183,3,0.25), rgba(255,183,3,0.05))",
    border: "#FFB703",
    text: "#FFB703",
  },
  CRITICAL: {
    bg: "linear-gradient(90deg, rgba(239,35,60,0.28), rgba(239,35,60,0.06))",
    border: "#EF233C",
    text: "#EF233C",
  },
};

const MESSAGE: Record<AlertLevel, { en: string; ta: string }> = {
  SAFE: { en: "✅ கடல் பயணம் பாதுகாப்பானது | Safe to Sail", ta: "✅ கடல் பயணம் பாதுகாப்பானது | Safe to Sail" },
  CAUTION: { en: "⚠️ எச்சரிக்கை | Caution Advised", ta: "⚠️ எச்சரிக்கை | Caution Advised" },
  CRITICAL: { en: "🚨 அபாயம் | DANGER — Do Not Sail", ta: "🚨 அபாயம் | DANGER — Do Not Sail" },
};

export default function AlertBanner({
  status,
  loading = false,
}: {
  status?: AlertLevel;
  loading?: boolean;
}) {
  if (loading && !status) {
    return (
      <div
        className="h-14 w-full animate-pulse rounded-card border"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      />
    );
  }
  const level: AlertLevel = status ?? "SAFE";
  const s = STYLES[level];

  return (
    <motion.div
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 120, damping: 16 }}
      className={`relative overflow-hidden rounded-card border px-4 py-3 ${level === "CRITICAL" ? "animate-pulse" : ""}`}
      style={{ background: s.bg, borderColor: s.border }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-base font-bold" style={{ color: s.text }}>
          {MESSAGE[level].en}
        </span>
        <span
          className="rounded-full px-3 py-1 text-xs font-extrabold tracking-wider"
          style={{ background: `${s.text}22`, color: s.text }}
        >
          {level}
        </span>
      </div>
    </motion.div>
  );
}
