import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ocean: {
          100: "#CAF0F8",
          200: "#ADE8F4",
          300: "#90E0EF",
          400: "#48CAE4",
          500: "#00B4D8",
          600: "#0096C7",
          700: "#0077B6",
          800: "#023E8A",
          900: "#03045E",
        },
        cyan: {
          DEFAULT: "#06D6A0",
          accent: "#06D6A0",
        },
        "amber-warn": "#FFB703",
        "red-danger": "#EF233C",
        "safe-green": "#2DC653",
        light: {
          bg: "#F0F9FF",
          card: "#FFFFFF",
          text: "#03045E",
          muted: "#0077B6",
        },
        dark: {
          bg: "#03045E",
          card: "#023E8A",
          text: "#CAF0F8",
          muted: "#90E0EF",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Noto Sans Tamil", "sans-serif"],
      },
      fontSize: {
        h1: ["64px", { fontWeight: "800", lineHeight: "1.05" }],
        h2: ["48px", { fontWeight: "700", lineHeight: "1.1" }],
        h3: ["32px", { fontWeight: "600", lineHeight: "1.2" }],
        body: ["16px", { fontWeight: "400", lineHeight: "1.6" }],
        small: ["14px", { fontWeight: "400", lineHeight: "1.5" }],
      },
      borderRadius: {
        card: "16px",
        btn: "12px",
        input: "8px",
      },
      boxShadow: {
        card: "0 4px 24px rgba(0,180,216,0.15)",
        hover: "0 8px 32px rgba(0,180,216,0.25)",
      },
      transitionProperty: {
        all: "all",
      },
      transitionDuration: {
        DEFAULT: "300ms",
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.5", transform: "scale(1.25)" },
        },
        ticker: {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "wave-drift": {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "200% 50%" },
        },
        "float-particle": {
          "0%, 100%": { transform: "translateY(0) translateX(0)", opacity: "0.3" },
          "50%": { transform: "translateY(-24px) translateX(8px)", opacity: "0.9" },
        },
        "marker-drop": {
          "0%": { transform: "translateY(-40px)", opacity: "0" },
          "60%": { transform: "translateY(4px)", opacity: "1" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
        ticker: "ticker 30s linear infinite",
        "wave-drift": "wave-drift 12s linear infinite alternate",
        particle: "float-particle 6s ease-in-out infinite",
        "marker-drop": "marker-drop 0.6s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
