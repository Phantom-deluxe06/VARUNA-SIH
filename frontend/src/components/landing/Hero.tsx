"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ArrowRight, Waves } from "lucide-react";
import { usePolling } from "@/hooks/useApi";
import { getVesselStatus } from "@/lib/api";

const STATUS_COLORS = { SAFE: "#2DC653", CAUTION: "#FFB703", CRITICAL: "#EF233C" } as const;

export default function Hero() {
  const { t } = useTranslation();
  const { data: status, loading } = usePolling("hero-status", getVesselStatus, 30_000);

  const particles = Array.from({ length: 24 }, (_, i) => ({
    left: `${(i * 37) % 100}%`,
    top: `${(i * 53) % 100}%`,
    size: 2 + ((i * 7) % 4),
    delay: (i % 12) * 0.5,
  }));

  return (
    <section className="hero-ocean relative flex min-h-screen items-center overflow-hidden">
      {/* Floating particles */}
      {particles.map((p, i) => (
        <span
          key={i}
          className="particle"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            animationDelay: `${p.delay}s`,
          }}
          aria-hidden
        />
      ))}

      <div className="relative z-10 mx-auto w-full max-w-5xl px-4 pb-24 pt-32 text-center text-white sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-5 py-2 text-small font-semibold backdrop-blur-sm"
        >
          🛰️ {t("powered_isro")}
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="mx-auto max-w-4xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl lg:text-[64px]"
        >
          {t("hero_title")}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[#CAF0F8] sm:text-lg"
        >
          {t("hero_sub")}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.45 }}
          className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row"
        >
          <a
            href="https://wa.me/14155238886?text=join%20lost-yellow"
            target="_blank"
            rel="noreferrer"
            className="v-btn-primary flex items-center gap-2 px-8 py-4 text-lg"
          >
            {t("try_whatsapp")} <ArrowRight size={20} />
          </a>
          <Link href="/dashboard" className="v-btn-outline px-8 py-4 text-lg text-white">
            {t("open_dashboard")}
          </Link>
        </motion.div>

        {/* Live status strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.6 }}
          className="mt-10 inline-flex items-center gap-3 rounded-full border border-white/25 bg-[#03045E]/60 px-5 py-2.5 text-small font-semibold backdrop-blur-sm"
        >
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2DC653] opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-[#2DC653]" />
          </span>
          {loading && !status ? (
            <span className="animate-pulse">Connecting to VARUNA satellites…</span>
          ) : status ? (
            <>
              🟢 {t("live_now")} — {status.sst_celsius.toFixed(1)}°C SST |{" "}
              {status.wave_height_m.toFixed(2)}m waves |{" "}
              <span style={{ color: STATUS_COLORS[status.status ?? "SAFE"] }} className="font-extrabold">
                {status.status ?? "SAFE"}
              </span>
            </>
          ) : (
            <span className="text-[#FFB703]">Could not reach VARUNA servers — retrying…</span>
          )}
        </motion.div>
      </div>

      {/* Wave divider */}
      <div className="absolute inset-x-0 bottom-0" aria-hidden>
        <svg viewBox="0 0 1440 90" preserveAspectRatio="none" className="h-[60px] w-full" style={{ fill: "var(--bg)" }}>
          <path d="M0,60 C240,90 480,30 720,50 C960,70 1200,20 1440,55 L1440,90 L0,90 Z" />
        </svg>
      </div>
      <Waves className="absolute bottom-4 left-4 hidden text-white/20 lg:block" size={40} aria-hidden />
    </section>
  );
}
