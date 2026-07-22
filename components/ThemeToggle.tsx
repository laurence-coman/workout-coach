"use client";

import { useEffect, useState } from "react";

// Night mode: auto-dark between 8pm and 7am local time, warm palette.
// Manual toggle overrides and is remembered until toggled back to auto-match.
export function autoTheme(): "light" | "dark" {
  const h = new Date().getHours();
  return h >= 20 || h < 7 ? "dark" : "light";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    // The inline head script already set the attribute; mirror it into state
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      // If the choice matches what auto would pick, drop the override
      if (next === autoTheme()) localStorage.removeItem("theme");
      else localStorage.setItem("theme", next);
    } catch {}
  }

  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      title={theme === "dark" ? "Switch to light mode" : "Switch to night mode"}
      aria-label="Toggle night mode"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
