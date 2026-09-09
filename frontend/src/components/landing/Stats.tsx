"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";

interface StatDef {
  target: number;
  decimals: number;
  suffix: string;
  label: string;
}

const STATS: StatDef[] = [
  { target: 8.6, decimals: 1, suffix: "M", label: "Fishermen Protected" },
  { target: 3, decimals: 0, suffix: "s", label: "Response Time" },
  { target: 99.5, decimals: 1, suffix: "%", label: "Uptime" },
  { target: 24, decimals: 0, suffix: "/7", label: "Live Monitoring" },
];

function Counter({ stat, active }: { stat: StatDef; active: boolean }) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;
    const duration = 1800;
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setValue(stat.target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, stat.target]);

  return (
    <span className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl">
      {value.toFixed(stat.decimals)}
      <span style={{ color: "#06D6A0" }}>{stat.suffix}</span>
    </span>
  );
}

export default function Stats() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="py-20" style={{ background: "#03045E" }}>
      <div ref={ref} className="mx-auto grid max-w-6xl grid-cols-2 gap-10 px-4 text-center sm:px-6 lg:grid-cols-4">
        {STATS.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.12 }}
          >
            <Counter stat={s} active={inView} />
            <p className="mt-3 text-small font-semibold uppercase tracking-wider" style={{ color: "#90E0EF" }}>
              {s.label}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
