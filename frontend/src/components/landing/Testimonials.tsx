"use client";

import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

const TESTIMONIALS = [
  {
    avatar: "🎣",
    name: "Murugan, Rameswaram",
    quote: "VARUNA told me exactly where to go. Saved 3 hours of fuel.",
  },
  {
    avatar: "🛡️",
    name: "Coast Guard Officer, Chennai",
    quote: "Real-time IMBL monitoring has improved our patrol efficiency.",
  },
  {
    avatar: "⚓",
    name: "Port Captain, Tuticorin",
    quote: "UKC calculations are now instant. No more manual charts.",
  },
] as const;

export default function Testimonials() {
  const { t } = useTranslation();
  return (
    <section className="py-24" style={{ background: "var(--card)" }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          className="text-center text-3xl font-extrabold sm:text-h2"
        >
          {t("testimonials_title")}
        </motion.h2>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {TESTIMONIALS.map((c, i) => (
            <motion.blockquote
              key={c.name}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.15, duration: 0.45 }}
              whileHover={{ scale: 1.03 }}
              className="v-card v-card-hover p-8"
            >
              <div className="flex items-center gap-4">
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-full text-3xl"
                  style={{ background: "var(--bg)" }}
                  aria-hidden
                >
                  {c.avatar}
                </span>
                <div>
                  <div className="font-bold" aria-label={`${"★".repeat(5)} rating`}>
                    ⭐⭐⭐⭐⭐
                  </div>
                  <cite className="text-small font-semibold not-italic" style={{ color: "var(--muted)" }}>
                    {c.name}
                  </cite>
                </div>
              </div>
              <p className="mt-5 text-body leading-relaxed">“{c.quote}”</p>
            </motion.blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}
