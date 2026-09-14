import { requirePlatformAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { NewClientForm } from "@/components/admin/new-client-form";
import { ClientRow } from "@/components/admin/client-row";
import { Zap } from "lucide-react";
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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Zap className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
            SpeedLead — Platform Admin
          </Link>
          <Link href="/leads" className="text-sm text-slate-500 hover:text-slate-900">
            ← Back to dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Email delivery is limited right now:</strong> the sending domain
          (<code>onboarding@resend.dev</code>) can only deliver to your own Resend account email —
          invites to any other address won&apos;t arrive, and neither will this app&apos;s own
          lead-response emails to real customers. Verifying a real domain in Resend (~$9-12/yr for
          a domain if you don&apos;t have one) removes this limit entirely. Until then, test with
          your own email.
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h1 className="text-lg font-bold text-slate-900">Add a client</h1>
          <p className="mt-1 text-sm text-slate-500">
            Creates their workspace and emails them an invite to set a password — this is the only
            way a new account gets created. Nothing here processes payment; handle that separately
            and set the plan/status here once they&apos;ve paid.
          </p>
          <div className="mt-4">
            <NewClientForm />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            All clients ({orgs?.length ?? 0})
          </h2>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
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
                {!orgs || orgs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                      No clients yet — add one above.
                    </td>
                  </tr>
                ) : (
                  (orgs as Organization[]).map((org) => <ClientRow key={org.id} org={org} />)
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
