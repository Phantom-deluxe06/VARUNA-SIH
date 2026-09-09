"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { setLanguage } from "@/lib/i18n";

export default function LangToggle() {
  const { i18n } = useTranslation();
  const [lang, setLang] = useState("en");

  useEffect(() => {
    setLang(i18n.language?.startsWith("ta") ? "ta" : "en");
  }, [i18n.language]);

  const toggle = () => {
    const next = lang === "en" ? "ta" : "en";
    setLanguage(next);
    setLang(next);
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle language"
      className="flex h-9 items-center gap-1 rounded-btn border px-3 text-sm font-semibold transition-all duration-300 hover:shadow-card"
      style={{ borderColor: "var(--border)", color: "var(--text)" }}
    >
      <span className={lang === "en" ? "opacity-100" : "opacity-40"}>EN</span>
      <span className="opacity-40">/</span>
      <span className={lang === "ta" ? "opacity-100" : "opacity-40"}>தமிழ்</span>
    </button>
  );
}
