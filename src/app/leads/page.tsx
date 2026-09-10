import Link from "next/link";
import { Inbox, Timer, AlertCircle, ChevronRight } from "lucide-react";
import { requireCurrentOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import type { Lead } from "@/lib/types/database";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  new: "bg-amber-100 text-amber-800",
  contacted: "bg-blue-100 text-blue-800",
  responded: "bg-indigo-100 text-indigo-800",
  qualified: "bg-purple-100 text-purple-800",
  won: "bg-emerald-100 text-emerald-800",
  lost: "bg-slate-100 text-slate-600",
  spam: "bg-red-100 text-red-700",
};

export default async function LeadsPage() {
  const { org } = await requireCurrentOrg();
  const supabase = await createClient();

  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (leads ?? []) as Lead[];
  const responded = rows.filter((l) => l.first_response_seconds != null);
  const avgResponseSeconds = responded.length
    ? Math.round(responded.reduce((sum, l) => sum + (l.first_response_seconds ?? 0), 0) / responded.length)
    : null;
  const awaitingResponse = rows.filter((l) => l.status === "new").length;

  return (
    <DashboardShell org={org}>
      <h1 className="text-xl font-bold text-slate-900">Leads</h1>
      <p className="mt-1 text-sm text-slate-500">Everyone who&apos;s reached out, fastest response first.</p>

      <div className="mt-6 mb-6 flex flex-wrap gap-4">
        <StatCard icon={Inbox} label="Leads (last 100)" value={String(rows.length)} />
        <StatCard
          icon={Timer}
          label="Avg. first response"
          value={avgResponseSeconds != null ? formatDuration(avgResponseSeconds) : "—"}
        />
        <StatCard
          icon={AlertCircle}
          label="Awaiting response"
          value={String(awaitingResponse)}
          highlight={awaitingResponse > 0}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">First response</th>
              <th className="px-4 py-3">Received</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center">
                  <Inbox className="mx-auto h-8 w-8 text-slate-300" strokeWidth={1.5} />
                  <p className="mt-3 text-sm text-slate-500">
                    No leads yet. Connect a lead source in Settings to start receiving them.
                  </p>
                  <Link
                    href="/settings/integrations"
                    className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700"
                  >
                    Go to Integrations →
                  </Link>
                </td>
              </tr>
            ) : (
              rows.map((lead) => (
                <tr key={lead.id} className="border-b border-slate-100 last:border-0 transition hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/leads/${lead.id}`} className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                        {initials(lead.name || lead.phone || lead.email || "?")}
                      </span>
                      <span>
                        <span className="block font-medium text-slate-900 hover:underline">
                          {lead.name || lead.phone || lead.email || "Unknown"}
                        </span>
                        <span className="block text-xs text-slate-400">{lead.phone || lead.email}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        STATUS_STYLES[lead.status] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {lead.first_response_seconds != null
                      ? `${formatDuration(lead.first_response_seconds)} via ${lead.first_response_channel}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{new Date(lead.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight className="ml-auto h-4 w-4 text-slate-300" />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </DashboardShell>
  );
}

function StatCard(props: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex min-w-[180px] flex-1 items-center gap-3 rounded-2xl border p-4 ${
        props.highlight ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white shadow-sm shadow-slate-200/50"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          props.highlight ? "bg-amber-100 text-amber-700" : "bg-brand-50 text-brand-600"
        }`}
      >
        <props.icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500">{props.label}</div>
        <div className="mt-0.5 text-2xl font-bold text-slate-900">{props.value}</div>
      </div>
    </div>
  );
}

function initials(input: string) {
  if (input.startsWith("+") || input.includes("@")) return input.slice(0, 1).toUpperCase();
  return input
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}
