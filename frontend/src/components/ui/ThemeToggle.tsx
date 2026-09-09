"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="h-9 w-9 rounded-btn" aria-hidden />;
  }

  const isDark = resolvedTheme === "dark";
  return (
    <button
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex h-9 w-9 items-center justify-center rounded-btn border transition-all duration-300 hover:shadow-card"
      style={{ borderColor: "var(--border)", color: "var(--text)" }}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
