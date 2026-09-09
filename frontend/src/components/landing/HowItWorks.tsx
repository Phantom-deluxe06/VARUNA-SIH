"use client";

import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { BrainCircuit, MapPin, MessageCircle } from "lucide-react";

const STEPS = [
  {
    icon: MessageCircle,
    color: "#00B4D8",
    titleKey: "step1_title",
    descKey: "step1_desc",
    emoji: "💬",
  },
  {
    icon: BrainCircuit,
    color: "#48CAE4",
    titleKey: "step2_title",
    descKey: "step2_desc",
    emoji: "🛰️",
  },
  {
    icon: MapPin,
    color: "#2DC653",
    titleKey: "step3_title",
    descKey: "step3_desc",
    emoji: "📍",
  },
] as const;

export default function HowItWorks() {
  const { t } = useTranslation();

  return (
    <section id="how-it-works" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          className="text-center text-3xl font-extrabold sm:text-h2"
        >
          {t("how_title")}
        </motion.h2>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.titleKey}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.15, duration: 0.5 }}
              whileHover={{ scale: 1.03 }}
              className="v-card v-card-hover relative overflow-hidden p-8"
            >
              <span
                className="absolute -right-3 -top-3 text-7xl font-extrabold opacity-10"
                style={{ color: step.color }}
                aria-hidden
              >
                {i + 1}
              </span>
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.4 }}
                className="flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{ background: `${step.color}22`, color: step.color }}
              >
                <step.icon size={28} />
              </motion.div>
              <h3 className="mt-5 text-xl font-bold">{t(step.titleKey)}</h3>
              <p className="mt-3 text-small leading-relaxed" style={{ color: "var(--muted)" }}>
                {t(step.descKey)}
              </p>
              {/* Animated accent bar */}
              <motion.div
                className="mt-6 h-1 rounded-full"
                style={{ background: step.color }}
                initial={{ width: "15%" }}
                whileInView={{ width: ["15%", "70%", "15%"] }}
                viewport={{ once: true }}
                transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.5 }}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
