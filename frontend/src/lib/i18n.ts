"use client";

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../../public/locales/en/common.json";
import ta from "../../public/locales/ta/common.json";

export type Lang = "en" | "ta";

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      ta: { translation: ta },
    },
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

  const saved =
    typeof window !== "undefined" ? (localStorage.getItem("varuna-lang") as Lang | null) : null;
  if (saved === "ta" || saved === "en") {
    i18n.changeLanguage(saved);
  }
}

export function setLanguage(lang: Lang) {
  i18n.changeLanguage(lang);
  localStorage.setItem("varuna-lang", lang);
}

export default i18n;
