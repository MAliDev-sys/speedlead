import Link from "next/link";
import type { Organization } from "@/lib/types/database";
import { SignOutButton } from "@/components/sign-out-button";

const NAV = [
  { href: "/leads", label: "Leads" },
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/settings/sequences", label: "Follow-ups" },
];

export function DashboardShell(props: { org: Organization; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold tracking-tight text-slate-900">
              ⚡ SpeedLead
            </span>
            <nav className="flex gap-4">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm text-slate-600 hover:text-slate-900"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">{props.org.name}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{props.children}</main>
    </div>
  );
}
