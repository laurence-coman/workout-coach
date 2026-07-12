import type { Metadata, Viewport } from "next";
import NavLinks from "@/components/NavLinks";
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <span className="nav-brand">
            <span className="brand-dot" />
            Workout Coach
          </span>
          <NavLinks />
        </nav>
        <main className="main">{children}</main>
        <FeedbackWidget />
      </body>
    </html>
  );
}
