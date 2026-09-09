"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Fish, Home, MessageCircle, Navigation } from "lucide-react";

interface Tab {
  href: string;
  label: string;
  icon: typeof Home;
  hash?: string;
}

const TABS: Tab[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/map", label: "Map", icon: Navigation },
  { href: "/dashboard", label: "Ask", icon: MessageCircle, hash: "#chat" },
  { href: "/alerts", label: "Alerts", icon: AlertTriangle },
  { href: "/dashboard", label: "More", icon: Fish, hash: "#pfz" },
];

export default function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t md:hidden"
      style={{ background: "var(--card)", borderColor: "var(--border)", paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Mobile navigation"
    >
      {TABS.map(({ href, label, icon: Icon, hash }) => {
        const target = hash ? `${href}${hash}` : href;
        const active = pathname === href && !hash;
        return (
          <Link
            key={label}
            href={target}
            className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-semibold"
            style={{ color: active ? "#00B4D8" : "var(--muted)" }}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={20} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
