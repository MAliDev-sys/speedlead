import { requirePlatformAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { NewClientForm } from "@/components/admin/new-client-form";
import { ClientRow } from "@/components/admin/client-row";
import { Zap, Building2, CheckCircle2, Clock3, UserPlus } from "lucide-react";
import Link from "next/link";
import type { Organization } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requirePlatformAdmin();

  const admin = createAdminClient();
  const { data: orgs } = await admin
    .from("organizations")
    .select("*")
    .order("created_at", { ascending: false });

  const rows = (orgs ?? []) as Organization[];
  const activeCount = rows.filter((o) => o.subscription_status === "active").length;
  const trialingCount = rows.filter((o) => o.subscription_status === "trialing").length;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Zap className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
            SpeedLead — Platform Admin
          </Link>
          <Link
            href="/leads"
            className="rounded-full border border-slate-200 px-3.5 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            ← Back to dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Email delivery is limited right now:</strong> the sending domain
          (<code>onboarding@resend.dev</code>) can only deliver to your own Resend account email —
          invites to any other address won&apos;t arrive, and neither will this app&apos;s own
          lead-response emails to real customers. Verifying a real domain in Resend (~$9-12/yr for
          a domain if you don&apos;t have one) removes this limit entirely. Until then, test with
          your own email.
        </div>

        <div className="flex flex-wrap gap-4">
          <StatCard icon={Building2} label="Total clients" value={String(rows.length)} />
          <StatCard icon={CheckCircle2} label="Active (paid)" value={String(activeCount)} />
          <StatCard icon={Clock3} label="On trial" value={String(trialingCount)} />
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <UserPlus className="h-4.5 w-4.5" strokeWidth={2} />
            </span>
            <div>
              <h1 className="text-sm font-semibold text-slate-900">Add a client</h1>
              <p className="mt-0.5 text-sm text-slate-500">
                Creates their workspace and emails them an invite to set a password — this is the
                only way a new account gets created. Nothing here processes payment; handle that
                separately and set the plan/status here once they&apos;ve paid.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <NewClientForm />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">All clients ({rows.length})</h2>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Owner email</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                      No clients yet — add one above.
                    </td>
                  </tr>
                ) : (
                  rows.map((org) => <ClientRow key={org.id} org={org} />)
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function StatCard(props: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-[160px] flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/50">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <props.icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500">{props.label}</div>
        <div className="mt-0.5 text-2xl font-bold text-slate-900">{props.value}</div>
      </div>
    </div>
  );
}
