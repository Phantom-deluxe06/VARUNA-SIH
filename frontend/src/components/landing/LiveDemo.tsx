"use client";

import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { QrCode } from "lucide-react";
import ChatWidget from "@/components/ui/ChatWidget";

export default function LiveDemo() {
  const { t } = useTranslation();
  return (
    <section id="whatsapp" className="py-24" style={{ background: "var(--card)" }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          className="text-center"
        >
          <h2 className="text-3xl font-extrabold sm:text-h2">{t("demo_title")}</h2>
          <p className="mt-2 text-body" style={{ color: "var(--muted)" }}>
            {t("demo_sub")}
          </p>
        </motion.div>

        <div className="mt-12 grid items-stretch gap-8 lg:grid-cols-[1fr_1.2fr]">
          {/* WhatsApp QR card */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="v-card v-card-hover flex flex-col items-center justify-center p-8 text-center"
            style={{ background: "#03045E", color: "#CAF0F8", borderRadius: 16 }}
          >
            <div
              className="flex h-40 w-40 items-center justify-center rounded-2xl"
              style={{ background: "#023E8A", boxShadow: "0 0 40px rgba(6,214,160,0.25)" }}
            >
              <QrCode size={120} color="#06D6A0" strokeWidth={1.2} aria-hidden />
            </div>
            <p className="mt-6 text-body font-semibold">Or scan to chat on WhatsApp</p>
            <p className="mt-2 text-lg font-extrabold" style={{ color: "#06D6A0" }}>
              +1 415 523 8886
            </p>
            <p className="mt-1 text-small" style={{ color: "#90E0EF" }}>
              Code: <span className="rounded bg-[#023E8A] px-2 py-0.5 font-mono font-bold">join lost-yellow</span>
            </p>
            <a
              href="https://wa.me/14155238886?text=join%20lost-yellow"
              target="_blank"
              rel="noreferrer"
              className="v-btn-primary mt-6 px-6 py-3"
            >
              {t("try_whatsapp")}
            </a>
          </motion.div>

          {/* Live chat demo */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <ChatWidget height="480px" vesselLat={9.9252} vesselLon={79.3129} />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
