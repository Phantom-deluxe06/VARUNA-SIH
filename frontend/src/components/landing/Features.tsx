"use client";

import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

const FEATURES = [
  {
    emoji: "🛰️",
    title: "Real Satellite Data",
    desc: "Live SST and chlorophyll from ISRO MOSDAC and Copernicus Marine satellite products.",
  },
  {
    emoji: "🗣️",
    title: "Tamil Language",
    desc: "Full support for Tamil queries and responses. Ask naturally, get answers in your language.",
  },
  {
    emoji: "🚨",
    title: "IMBL Geofencing",
    desc: "Real-time alerts when approaching the India-Sri Lanka maritime boundary. Never cross accidentally.",
  },
  {
    emoji: "📱",
    title: "WhatsApp Bot",
    desc: "No app download needed. Works on any phone with WhatsApp. Even 2G networks.",
  },
  {
    emoji: "🌊",
    title: "Weather Safety",
    desc: "Live wave height, wind speed and storm alerts before you leave port.",
  },
  {
    emoji: "⛽",
    title: "Fuel Calculator",
    desc: "Calculate diesel needed for any fishing trip from your location to the nearest PFZ.",
  },
] as const;

export default function Features() {
  const { t } = useTranslation();
  return (
    <section id="features" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          className="text-center text-3xl font-extrabold sm:text-h2"
        >
          {t("features_grid_title")}
        </motion.h2>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.article
              key={f.title}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: (i % 3) * 0.12, duration: 0.45 }}
              whileHover={{ scale: 1.03 }}
              className="v-card v-card-hover p-7"
            >
              <span className="text-5xl" aria-hidden>
                {f.emoji}
              </span>
              <h3 className="mt-4 text-xl font-bold">{f.title}</h3>
              <p className="mt-2 text-small leading-relaxed" style={{ color: "var(--muted)" }}>
                {f.desc}
              </p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
