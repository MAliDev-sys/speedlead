import Link from "next/link";
import { Zap, Inbox, Plug, Clock3, ShieldCheck } from "lucide-react";
import type { Organization } from "@/lib/types/database";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { isPlatformAdmin } from "@/lib/admin";

const NAV = [
  { href: "/leads", label: "Leads", icon: Inbox },
  { href: "/settings/integrations", label: "Integrations", icon: Plug },
  { href: "/settings/sequences", label: "Follow-ups", icon: Clock3 },
];

export async function DashboardShell(props: {
  org: Organization;
  userId: string;
  children: React.ReactNode;
}) {
  const showAdminLink = await isPlatformAdmin(props.userId);
  const initials = props.org.name
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-8">
            <Link href="/leads" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white">
                <Zap className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
              SpeedLead
            </Link>
            <nav className="flex gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  <item.icon className="h-4 w-4" strokeWidth={2} />
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {showAdminLink ? (
              <Link
                href="/admin"
                className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin
              </Link>
            ) : null}
            <span className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1 pr-3 text-sm text-slate-700">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700">
                {initials || "?"}
              </span>
              {props.org.name}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{props.children}</main>
    </div>
  );
}
