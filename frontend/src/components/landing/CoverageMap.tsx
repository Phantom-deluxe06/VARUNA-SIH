"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { usePolling } from "@/hooks/useApi";
import { getPfzLatest, getVesselStatus } from "@/lib/api";

const MarineMap = dynamic(() => import("@/components/map/MarineMap"), {
  ssr: false,
  loading: () => (
    <div className="v-card flex h-[400px] animate-pulse items-center justify-center" style={{ color: "var(--muted)" }}>
      Loading marine map…
    </div>
  ),
});

export default function CoverageMap() {
  const { t } = useTranslation();
  const { data: status } = usePolling("coverage-status", getVesselStatus, 30_000);
  const { data: pfz } = usePolling("coverage-pfz", getPfzLatest, 300_000);

  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          className="text-center text-3xl font-extrabold sm:text-h2"
        >
          {t("coverage_title")}
        </motion.h2>
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="mt-10"
        >
          <MarineMap vessel={status} pfzZones={pfz?.zones ?? []} height="400px" zoom={8} showControls />
        </motion.div>
      </div>
    </section>
  );
}
