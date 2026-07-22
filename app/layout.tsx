import type { Metadata, Viewport } from "next";
import NavLinks from "@/components/NavLinks";
import ThemeToggle from "@/components/ThemeToggle";
import FeedbackWidget from "@/components/FeedbackWidget";
import "./globals.css";

export const metadata: Metadata = {
  title: "Workout Coach",
  description: "AI workout planning, logging, and dashboards",
  appleWebApp: { capable: true, title: "Coach", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f7f8f6",
};

// Runs before paint so night mode never flashes light first
const themeScript = `(function(){try{var o=localStorage.getItem("theme");var h=new Date().getHours();var auto=(h>=20||h<7)?"dark":"light";document.documentElement.setAttribute("data-theme",o||auto);}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <nav className="nav">
          <span className="nav-brand">
            <span className="brand-dot" />
            <span className="brand-text">Workout Coach</span>
          </span>
          <span className="nav-right">
            <NavLinks />
            <ThemeToggle />
          </span>
        </nav>
        <main className="main">{children}</main>
        <NavLinks variant="bottom" />
        <FeedbackWidget />
      </body>
    </html>
  );
}
