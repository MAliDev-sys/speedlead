import { notFound } from "next/navigation";
import { requireCurrentOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { LeadActions } from "@/components/lead-actions";
import { ReplyBox } from "@/components/reply-box";
import type { LeadEvent, MessageRow } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org } = await requireCurrentOrg();
  const supabase = await createClient();

  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();

  const [{ data: events }, { data: messages }] = await Promise.all([
    supabase
      .from("lead_events")
      .select("*")
      .eq("lead_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("messages")
      .select("*")
      .eq("lead_id", id)
      .order("created_at", { ascending: true }),
  ]);

  const timeline = buildTimeline(events ?? [], messages ?? []);

  return (
    <DashboardShell org={org}>
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <h1 className="text-xl font-semibold text-slate-900">
            {lead.name || lead.phone || lead.email}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Created {new Date(lead.created_at).toLocaleString()}
            {lead.first_response_seconds != null
              ? ` · first response in ${formatDuration(lead.first_response_seconds)}`
              : ""}
          </p>

          <ol className="mt-6 space-y-4 border-l border-slate-200 pl-4">
            {timeline.map((item) => (
              <li key={item.key} className="relative">
                <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-slate-400" />
                <div className="text-xs text-slate-400">
                  {new Date(item.at).toLocaleString()}
                </div>
                <div className="text-sm text-slate-800">{item.label}</div>
                {item.detail ? (
                  <div className="mt-1 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                    {item.detail}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Contact</h2>
            <dl className="mt-2 space-y-1 text-sm text-slate-600">
              {lead.phone ? (
                <div>
                  <dt className="inline text-slate-400">Phone: </dt>
                  <dd className="inline">{lead.phone}</dd>
                </div>
              ) : null}
              {lead.email ? (
                <div>
                  <dt className="inline text-slate-400">Email: </dt>
                  <dd className="inline">{lead.email}</dd>
                </div>
              ) : null}
              {lead.message ? (
                <div>
                  <dt className="text-slate-400">Message:</dt>
                  <dd>{lead.message}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          <ReplyBox lead={lead} />

          <LeadActions leadId={lead.id} status={lead.status} />
        </aside>
      </div>
    </DashboardShell>
  );
}

function buildTimeline(events: LeadEvent[], messages: MessageRow[]) {
  const items = [
    ...events.map((e) => ({
      key: `event-${e.id}`,
      at: e.created_at,
      label: describeEvent(e),
      detail: null as string | null,
    })),
    ...messages.map((m) => ({
      key: `message-${m.id}`,
      at: m.created_at,
      label: `${m.direction === "outbound" ? "Sent" : "Received"} ${m.channel.toUpperCase()}${
        m.status === "failed" ? " (failed)" : ""
      }`,
      detail: m.body,
    })),
  ];
  return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function describeEvent(e: LeadEvent): string {
  switch (e.type) {
    case "created":
      return "Lead created";
    case "status_changed":
      return `Status changed to ${(e.payload as Record<string, string>)?.status ?? "?"}`;
    default:
      return e.type.replace(/_/g, " ");
  }
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}
