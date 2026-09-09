"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { LayoutDashboard, Menu, Waves, X } from "lucide-react";
import ThemeToggle from "@/components/ui/ThemeToggle";
import LangToggle from "@/components/ui/LangToggle";

export default function Navbar() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const links = [
    { href: "#features", label: t("features") },
    { href: "#how-it-works", label: t("how_it_works") },
    { href: "/map", label: t("live_map") },
    { href: "#whatsapp", label: t("whatsapp_bot") },
  ];

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 backdrop-blur-md"
      style={{ background: "var(--nav-bg)", borderBottom: "1px solid var(--border)" }}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2" aria-label="VARUNA home">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: "var(--cyan-gradient)" }}
          >
            <Waves size={20} color="#03045E" />
          </span>
          <span className="text-xl font-extrabold tracking-tight">VARUNA</span>
        </Link>

        <div className="hidden items-center gap-7 lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-small font-semibold transition-colors duration-300 hover:text-[#00B4D8]"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <LangToggle />
          <ThemeToggle />
          <Link href="/dashboard" className="v-btn-primary px-5 py-2.5 text-small">
            {t("open_dashboard")}
          </Link>
        </div>

        <button
          className="flex h-10 w-10 items-center justify-center rounded-btn border lg:hidden"
          style={{ borderColor: "var(--border)" }}
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
          aria-expanded={open}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden lg:hidden"
            style={{ background: "var(--card)", borderTop: "1px solid var(--border)" }}
          >
            <div className="flex flex-col gap-1 p-4">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-input px-3 py-2.5 text-body font-semibold transition-colors hover:bg-[#00B4D8]/10"
                >
                  {l.label}
                </Link>
              ))}
              <div className="mt-2 flex items-center gap-3">
                <LangToggle />
                <ThemeToggle />
                <Link
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className="v-btn-primary flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-small"
                >
                  <LayoutDashboard size={16} />
                  {t("open_dashboard")}
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
