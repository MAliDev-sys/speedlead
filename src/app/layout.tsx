import type { Metadata } from "next";
import "./globals.css";

// Plain system font stack (see globals.css) instead of next/font/google:
// one less network dependency at build time, and plenty polished for MVP —
// swap in a real webfont later if the brand needs it.

export const metadata: Metadata = {
  title: "SpeedLead — Respond to every lead in seconds",
  description:
    "Instant SMS, email, WhatsApp, and Slack response the moment a lead comes in. Built for HVAC, plumbing, and local service businesses.",
};

// Runs synchronously before React hydrates, so the correct theme class is
// already on <html> at first paint — without this, the page would flash
// light mode for a frame even for a user who chose dark. Falls back to OS
// preference when nothing's been chosen yet (see ThemeToggle for the
// write side of this same key).
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('speedlead-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
