"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  Anchor,
  BarChart3,
  Fish,
  Home,
  Map as MapIcon,
  Settings,
  Ship,
  Waves,
  Wind,
} from "lucide-react";
import ThemeToggle from "@/components/ui/ThemeToggle";
import LangToggle from "@/components/ui/LangToggle";

const ROLES = [
  { id: "fisherman", label: "🎣 Fisherman" },
  { id: "coast_guard", label: "🛡️ Coast Guard" },
  { id: "port_pilot", label: "⚓ Port Pilot" },
] as const;

export type RoleId = (typeof ROLES)[number]["id"];

const NAV = [
  { href: "/dashboard", label: "Overview", icon: Home },
  { href: "/map", label: "Live Map", icon: MapIcon },
  { href: "/dashboard#pfz", label: "Fishing Zones", icon: Fish },
  { href: "/alerts", label: "Alerts", icon: AlertTriangle },
  { href: "/dashboard#weather", label: "Weather", icon: Wind },
  { href: "/dashboard#route", label: "Route Planner", icon: Ship },
  { href: "/dashboard#analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard#settings", label: "Settings", icon: Settings },
] as const;

export default function Sidebar() {
  const pathname = usePathname();
  const [role, setRole] = useState<RoleId>("fisherman");

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 hidden w-[260px] flex-col border-r md:flex"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "var(--cyan-gradient)" }}>
          <Waves size={20} color="#03045E" />
        </span>
        <span className="text-xl font-extrabold tracking-tight">VARUNA</span>
      </div>

      <div className="px-4">
        <label htmlFor="role-select" className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          Role
        </label>
        <select
          id="role-select"
          value={role}
          onChange={(e) => setRole(e.target.value as RoleId)}
          className="v-input w-full px-3 py-2 text-small font-semibold"
        >
          {ROLES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <nav className="mt-5 flex-1 space-y-1 overflow-y-auto px-3" aria-label="Dashboard navigation">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={label}
              href={href}
              aria-current={active ? "page" : undefined}
              className="flex items-center gap-3 rounded-input px-3 py-2.5 text-small font-semibold transition-all duration-300"
              style={
                active
                  ? { background: "var(--cyan-gradient)", color: "#03045E" }
                  : { color: "var(--muted)" }
              }
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t p-4" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2">
          <LangToggle />
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-2 text-xs font-bold" style={{ color: "#2DC653" }}>
          <span className="inline-block h-2 w-2 animate-pulse-dot rounded-full bg-[#2DC653]" />
          v3.0 LIVE
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
          <Anchor size={14} />
          <span>{ROLES.find((r) => r.id === role)?.label}</span>
        </div>
      </div>
    </aside>
  );
}
