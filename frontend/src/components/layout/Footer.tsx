"use client";

import Link from "next/link";
import { Waves } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function Footer() {
  const { t } = useTranslation();
  return (
    <footer
      className="border-t py-12"
      style={{ background: "#03045E", color: "#CAF0F8", borderColor: "rgba(144,224,239,0.2)" }}
    >
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "var(--cyan-gradient)" }}>
              <Waves size={20} color="#03045E" />
            </span>
            <span className="text-xl font-extrabold">VARUNA</span>
          </div>
          <p className="mt-3 text-small" style={{ color: "#90E0EF" }}>
            {t("footer_tagline")}
          </p>
          <p className="mt-4 text-small">{t("made_for")}</p>
        </div>
        <div>
          <h3 className="text-small font-bold uppercase tracking-wider" style={{ color: "#48CAE4" }}>
            Links
          </h3>
          <ul className="mt-3 space-y-2 text-small">
            {[
              ["About", "#how-it-works"],
              ["Features", "#features"],
              ["API", "https://varuna-sih-production.up.railway.app/docs"],
              ["GitHub", "https://github.com"],
            ].map(([label, href]) => (
              <li key={label}>
                <a href={href} className="transition-colors hover:text-[#06D6A0]" target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-small font-bold uppercase tracking-wider" style={{ color: "#48CAE4" }}>
            Data Sources
          </h3>
          <ul className="mt-3 space-y-2 text-small" style={{ color: "#90E0EF" }}>
            <li>Open-Meteo Marine API</li>
            <li>Copernicus Marine</li>
            <li>ISRO / MOSDAC</li>
          </ul>
        </div>
      </div>
      <div className="mt-10 text-center text-small" style={{ color: "#90E0EF" }}>
        © 2026 VARUNA Maritime Intelligence
      </div>
    </footer>
  );
}
