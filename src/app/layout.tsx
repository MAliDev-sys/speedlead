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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
