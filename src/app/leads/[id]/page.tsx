import { notFound } from "next/navigation";
import {
  Inbox,
  MessageSquare,
  Mail,
  Bell,
  RefreshCw,
  PhoneMissed,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { requireCurrentOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { LeadActions } from "@/components/lead-actions";
import { ReplyBox } from "@/components/reply-box";
import type { LeadEvent, MessageRow } from "@/lib/types/database";

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

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org, userId } = await requireCurrentOrg();
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
  const displayName = lead.name || lead.phone || lead.email || "Unknown";
  const initials = getInitials(displayName);

  return (
    <DashboardShell org={org} userId={userId}>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 text-base font-semibold text-brand-700">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">{displayName}</h1>
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                STATUS_STYLES[lead.status] ?? "bg-slate-100 text-slate-600"
              }`}
            >
              {lead.status}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            Created {new Date(lead.created_at).toLocaleString()}
            {lead.first_response_seconds != null
              ? ` · first response in ${formatDuration(lead.first_response_seconds)} via ${lead.first_response_channel}`
              : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50">
            <h2 className="text-sm font-semibold text-slate-900">Timeline</h2>
            <ol className="mt-4 space-y-5">
              {timeline.map((item) => (
                <li key={item.key} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                    <item.icon className="h-3.5 w-3.5" strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1 pb-0.5">
                    <div className="text-xs text-slate-400">{new Date(item.at).toLocaleString()}</div>
                    <div className="text-sm font-medium text-slate-800">{item.label}</div>
                    {item.detail ? (
                      <div className="mt-1 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                        {item.detail}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/50">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <UserRound className="h-3.5 w-3.5" strokeWidth={2} />
              </span>
              <h2 className="text-sm font-semibold text-slate-900">Contact</h2>
            </div>
            <dl className="mt-3 space-y-1.5 text-sm text-slate-600">
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

interface TimelineItem {
  key: string;
  at: string;
  label: string;
  detail: string | null;
  icon: LucideIcon;
}

function buildTimeline(events: LeadEvent[], messages: MessageRow[]): TimelineItem[] {
  const items: TimelineItem[] = [
    ...events.map((e) => ({
      key: `event-${e.id}`,
      at: e.created_at,
      label: describeEvent(e),
      detail: describeEventDetail(e),
      icon: iconForEvent(e),
    })),
    ...messages.map((m) => ({
      key: `message-${m.id}`,
      at: m.created_at,
      label: `${m.direction === "outbound" ? "Sent" : "Received"} ${m.channel.toUpperCase()}${
        m.status === "failed" ? " (failed)" : ""
      }`,
      detail: m.body,
      icon: iconForChannel(m.channel),
    })),
  ];
  return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function iconForEvent(e: LeadEvent): LucideIcon {
  if (e.type === "created") return Inbox;
  if (e.type === "status_changed") return RefreshCw;
  if (e.type === "call_missed") return PhoneMissed;
  if (e.type === "slack_notified") return Bell;
  if (e.type.startsWith("sms") || e.type.startsWith("whatsapp")) return MessageSquare;
  if (e.type.startsWith("email")) return Mail;
  return RefreshCw;
}

function iconForChannel(channel: string): LucideIcon {
  if (channel === "email") return Mail;
  if (channel === "slack") return Bell;
  return MessageSquare;
}

function describeEvent(e: LeadEvent): string {
  const payload = e.payload as { ok?: boolean } | null;
  switch (e.type) {
    case "created":
      return "Lead created";
    case "status_changed":
      return `Status changed to ${(e.payload as Record<string, string>)?.status ?? "?"}`;
    case "slack_notified":
      return payload?.ok === false ? "Slack notification failed" : "Slack notified";
    default:
      if (e.type.endsWith("_sent") && payload?.ok === false) {
        return `${e.type.replace(/_/g, " ")} — failed`;
      }
      return e.type.replace(/_/g, " ");
  }
}

/** Surfaces the underlying error for a failed send, if there is one. */
function describeEventDetail(e: LeadEvent): string | null {
  const payload = e.payload as { ok?: boolean; error?: string | null } | null;
  if (payload?.ok === false && payload.error) return payload.error;
  return null;
}

function getInitials(input: string) {
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
