import Link from "next/link";
import { Zap, MessageSquare, Bell, Mail } from "lucide-react";

const POINTS = [
  { icon: MessageSquare, text: "Instant SMS the second a lead comes in" },
  { icon: Mail, text: "Automatic email confirmation, personalized" },
  { icon: Bell, text: "Real-time Slack alerts your whole team sees" },
];

export function AuthLayout(props: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-brand-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="bg-dot-grid pointer-events-none absolute inset-0 opacity-30" />
        <Link href="/" className="relative flex items-center gap-2 text-lg font-bold text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
            <Zap className="h-4.5 w-4.5" strokeWidth={2.5} />
          </span>
          SpeedLead
        </Link>

        <div className="relative">
          <h2 className="max-w-sm text-3xl font-bold leading-snug text-white">
            Respond to every lead in seconds, not hours.
          </h2>
          <ul className="mt-8 space-y-4">
            {POINTS.map((point) => (
              <li key={point.text} className="flex items-center gap-3 text-brand-50">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <point.icon className="h-4 w-4" strokeWidth={2} />
                </span>
                <span className="text-sm">{point.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-brand-200">
          © {new Date().getFullYear()} SpeedLead. Built for local service businesses.
        </p>
      </div>

      <div className="flex items-center justify-center bg-slate-50 px-4 py-16">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-bold text-slate-900 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Zap className="h-4.5 w-4.5" strokeWidth={2.5} />
            </span>
            SpeedLead
          </Link>
          {props.children}
        </div>
      </div>
    </main>
  );
}
