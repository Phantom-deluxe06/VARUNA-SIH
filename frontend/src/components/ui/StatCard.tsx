"use client";

import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface StatCardProps {
  icon: LucideIcon;
  title: string;
  value: string;
  sub: string;
  color: string; // hex accent
  trend?: "up" | "down";
  loading?: boolean;
}

export default function StatCard({
  icon: Icon,
  title,
  value,
  sub,
  color,
  trend,
  loading = false,
}: StatCardProps) {
  if (loading) {
    return (
      <div className="v-card h-40 animate-pulse p-5" aria-busy="true">
        <div className="h-4 w-24 rounded bg-current opacity-20" />
        <div className="mt-6 h-10 w-32 rounded bg-current opacity-20" />
        <div className="mt-3 h-3 w-28 rounded bg-current opacity-20" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.03, y: -4 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="v-card relative overflow-hidden p-5"
      style={{ background: `linear-gradient(135deg, ${color}18, var(--card) 60%)` }}
    >
      <div className="flex items-start justify-between">
        <span className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
          {title}
        </span>
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: `${color}22`, color }}
        >
          <Icon size={20} />
        </span>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <span className="text-4xl font-extrabold tracking-tight" style={{ color: "var(--text)" }}>
          {value}
        </span>
        {trend && (
          <span style={{ color }} aria-label={trend === "up" ? "rising" : "falling"}>
            {trend === "up" ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
          </span>
        )}
      </div>
      <p className="mt-2 text-small" style={{ color: "var(--muted)" }}>
        {sub}
      </p>
    </motion.div>
  );
}
