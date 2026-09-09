"use client";

import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { I18nextProvider } from "react-i18next";
import i18n from "@/lib/i18n";

export default function Providers({ children }: { children: React.ReactNode }) {
  // Register service worker for offline support
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange={false}>
        {children}
      </ThemeProvider>
    </I18nextProvider>
  );
}
