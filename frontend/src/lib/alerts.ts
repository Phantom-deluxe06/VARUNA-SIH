export const STATUS = {
  SAFE: {
    en: "✅ கடல் பயணம் பாதுகாப்பானது | Safe to Sail",
    color: "#2DC653",
    bg: "linear-gradient(90deg, rgba(45,198,83,0.2), rgba(45,198,83,0.05))",
  },
  CAUTION: {
    en: "⚠️ எச்சரிக்கை | Caution Advised",
    color: "#FFB703",
    bg: "linear-gradient(90deg, rgba(255,183,3,0.25), rgba(255,183,3,0.05))",
  },
  CRITICAL: {
    en: "🚨 அபாயம் | DANGER — Do Not Sail",
    color: "#EF233C",
    bg: "linear-gradient(90deg, rgba(239,35,60,0.25), rgba(239,35,60,0.05))",
  },
} as const;
