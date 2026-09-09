"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";

export default function CtaSection() {
  const { t } = useTranslation();
  return (
    <section className="hero-ocean relative overflow-hidden py-24 text-center text-white">
      {Array.from({ length: 14 }, (_, i) => (
        <span
          key={i}
          className="particle"
          style={{
            left: `${(i * 41) % 100}%`,
            top: `${(i * 29) % 100}%`,
            width: 3 + (i % 3),
            height: 3 + (i % 3),
            animationDelay: `${(i % 6) * 0.4}s`,
          }}
          aria-hidden
        />
      ))}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative z-10 mx-auto max-w-3xl px-4 sm:px-6"
      >
        <h2 className="text-3xl font-extrabold sm:text-h2">{t("cta_title")}</h2>
        <p className="mt-4 text-body text-[#CAF0F8]">{t("cta_sub")}</p>
        <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href="https://wa.me/14155238886?text=join%20lost-yellow"
            target="_blank"
            rel="noreferrer"
            className="v-btn-primary flex items-center gap-2 px-8 py-4 text-lg"
          >
            {t("start_whatsapp")} <ArrowRight size={20} />
          </a>
          <Link href="/dashboard" className="v-btn-outline px-8 py-4 text-lg text-white">
            {t("open_dashboard")}
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
