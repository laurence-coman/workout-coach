"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Chat", icon: "💬" },
  { href: "/workout", label: "Workout", icon: "🏋️" },
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export default function NavLinks({ variant = "top" }: { variant?: "top" | "bottom" }) {
  const pathname = usePathname();
  if (variant === "bottom") {
    return (
      <nav className="bottom-nav">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={pathname === l.href ? "bn-link active" : "bn-link"}
          >
            <span className="bn-icon">{l.icon}</span>
            <span className="bn-label">{l.label}</span>
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <div className="nav-links">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={pathname === l.href ? "nav-link active" : "nav-link"}
        >
          {l.label}
        </Link>
      ))}
    </div>
  );
}
