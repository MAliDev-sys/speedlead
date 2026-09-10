import Link from "next/link";
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
      <div className="mb-6 flex flex-wrap gap-4">
        <StatCard label="Leads (last 100)" value={String(rows.length)} />
        <StatCard
          label="Avg. first response"
          value={avgResponseSeconds != null ? formatDuration(avgResponseSeconds) : "—"}
        />
        <StatCard
          label="Awaiting response"
          value={String(awaitingResponse)}
          highlight={awaitingResponse > 0}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">First response</th>
              <th className="px-4 py-3">Received</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  No leads yet. Connect a lead source in Settings to start receiving them.
                </td>
              </tr>
            ) : (
              rows.map((lead) => (
                <tr key={lead.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-slate-900 hover:underline">
                      {lead.name || lead.phone || lead.email || "Unknown"}
                    </Link>
                    <div className="text-xs text-slate-400">{lead.phone || lead.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </DashboardShell>
  );
}

function StatCard(props: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`min-w-[160px] flex-1 rounded-xl border p-4 ${
        props.highlight ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-slate-500">{props.label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{props.value}</div>
    </div>
  );
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}
