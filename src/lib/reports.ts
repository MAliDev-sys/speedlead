import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { Lead, LeadSource, LeadStatus } from "@/lib/types/database";

/**
 * Reports: period resolution (in the org's own timezone) and the metrics
 * behind app/reports. Everything is computed from data the pipeline
 * already records — leads (+ first_response_seconds, deal_value),
 * lead_events (*_sent, tagged ai / sequence / manual), and inbound
 * messages (customer replies) — read through the RLS-scoped session
 * client, so a report can only ever see its own org's rows.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

export const PERIOD_PRESETS = [
  { key: "this_week", label: "This week" },
  { key: "last_week", label: "Last week" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "last_30_days", label: "Last 30 days" },
] as const;

export type PeriodKey = (typeof PERIOD_PRESETS)[number]["key"] | "custom";

export interface ReportPeriod {
  key: PeriodKey;
  label: string;
  /** What the deltas compare against, e.g. "same days last week". */
  compareLabel: string;
  timezone: string;
  /** Inclusive local dates, YYYY-MM-DD. */
  startDate: string;
  endDate: string;
  prevStartDate: string;
  prevEndDate: string;
  /** UTC instants: [start, end) */
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
  /** Set when a custom range was invalid and a default was used instead. */
  notice: string | null;
}

const MAX_CUSTOM_DAYS = 366;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function resolvePeriod(
  params: { period?: string; from?: string; to?: string },
  timezone: string
): ReportPeriod {
  const tz = safeTimezone(timezone);
  const today = localDate(new Date(), tz);
  let notice: string | null = null;

  let key = (params.period ?? "this_month") as PeriodKey;
  let startDate: string;
  let endDate: string;
  let prevStartDate: string;
  let prevEndDate: string;
  let compareLabel: string;

  if (key === "custom") {
    const valid =
      params.from &&
      params.to &&
      DATE_RE.test(params.from) &&
      DATE_RE.test(params.to) &&
      params.from <= params.to &&
      daysBetween(params.from, params.to) < MAX_CUSTOM_DAYS;
    if (!valid) {
      notice = `That date range isn't valid (it must be at most ${MAX_CUSTOM_DAYS} days, start before end), so this month is shown instead.`;
      key = "this_month";
    }
  }

  switch (key) {
    case "this_week": {
      startDate = addDays(today, -mondayOffset(today));
      endDate = today;
      prevStartDate = addDays(startDate, -7);
      prevEndDate = addDays(endDate, -7);
      compareLabel = "the same days last week";
      break;
    }
    case "last_week": {
      endDate = addDays(today, -mondayOffset(today) - 1);
      startDate = addDays(endDate, -6);
      prevStartDate = addDays(startDate, -7);
      prevEndDate = addDays(endDate, -7);
      compareLabel = "the week before";
      break;
    }
    case "last_month": {
      startDate = addMonths(firstOfMonth(today), -1);
      endDate = addDays(firstOfMonth(today), -1);
      prevStartDate = addMonths(startDate, -1);
      prevEndDate = addDays(startDate, -1);
      compareLabel = "the month before";
      break;
    }
    case "last_30_days": {
      endDate = today;
      startDate = addDays(today, -29);
      prevEndDate = addDays(startDate, -1);
      prevStartDate = addDays(prevEndDate, -29);
      compareLabel = "the 30 days before";
      break;
    }
    case "custom": {
      startDate = params.from!;
      endDate = params.to!;
      const length = daysBetween(startDate, endDate) + 1;
      prevEndDate = addDays(startDate, -1);
      prevStartDate = addDays(prevEndDate, -(length - 1));
      compareLabel = `the previous ${length} day${length === 1 ? "" : "s"}`;
      break;
    }
    default: {
      // this_month (also the fallback for unknown keys)
      key = "this_month";
      startDate = firstOfMonth(today);
      endDate = today;
      prevStartDate = addMonths(startDate, -1);
      prevEndDate = minDate(addMonths(endDate, -1), addDays(startDate, -1));
      compareLabel = "the same days last month";
    }
  }

  const label =
    key === "custom"
      ? `${formatDate(startDate)} – ${formatDate(endDate)}`
      : PERIOD_PRESETS.find((p) => p.key === key)!.label;

  return {
    key,
    label,
    compareLabel,
    timezone: tz,
    startDate,
    endDate,
    prevStartDate,
    prevEndDate,
    start: zonedMidnight(startDate, tz),
    end: zonedMidnight(addDays(endDate, 1), tz),
    prevStart: zonedMidnight(prevStartDate, tz),
    prevEnd: zonedMidnight(addDays(prevEndDate, 1), tz),
    notice,
  };
}

/** "Oct 1, 2026" for a YYYY-MM-DD local date. */
export function formatDate(date: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(parseDate(date));
}

function safeTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

/** The calendar date (YYYY-MM-DD) an instant falls on in `tz`. */
export function localDate(instant: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function parseDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateString(d);
}

/** Same day-of-month `months` away, clamped to that month's last day. */
function addMonths(date: string, months: number) {
  const d = parseDate(date);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return toDateString(target);
}

function firstOfMonth(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function minDate(a: string, b: string) {
  return a < b ? a : b;
}

function mondayOffset(date: string) {
  return (parseDate(date).getUTCDay() + 6) % 7;
}

export function daysBetween(from: string, to: string) {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}

function tzOffsetMs(instant: Date, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The UTC instant of local midnight on `date` in `tz` (DST-safe). */
function zonedMidnight(date: string, tz: string) {
  const guess = parseDate(date).getTime();
  let t = guess - tzOffsetMs(new Date(guess), tz);
  t = guess - tzOffsetMs(new Date(t), tz);
  return new Date(t);
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const PAGE_SIZE = 1000;

/** PostgREST caps responses at 1,000 rows; page through everything. */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

export async function fetchLeadsInRange(supabase: Supabase, orgId: string, start: Date, end: Date) {
  // select("*") rather than a column list so the page still renders if
  // the deal_value migration (0009) hasn't been applied yet.
  return fetchAll<Lead>((from, to) =>
    supabase
      .from("leads")
      .select("*")
      .eq("org_id", orgId)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: true })
      .range(from, to)
  );
}

type SentEvent = { lead_id: string; type: string; payload: unknown; created_at: string };
type InboundMessage = { lead_id: string | null; created_at: string };

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export const PIPELINE: { status: LeadStatus; label: string }[] = [
  { status: "new", label: "New, not yet answered" },
  { status: "contacted", label: "Contacted" },
  { status: "responded", label: "Customer replied" },
  { status: "qualified", label: "Qualified" },
  { status: "won", label: "Won" },
  { status: "lost", label: "Lost" },
  { status: "spam", label: "Spam" },
];

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  webhook: "Webhook / Zapier",
  form: "Website form",
  email: "Email",
  missed_call: "Missed call",
  manual: "Added by hand",
  api: "API",
};

export type ReplyKind = "ai" | "template" | "followup" | "team";

export const REPLY_KIND_LABELS: Record<ReplyKind, string> = {
  ai: "AI replies",
  template: "Fixed-message replies",
  followup: "Automatic follow-ups",
  team: "Sent by your team",
};

export interface PeriodSummary {
  leads: number;
  medianResponseSeconds: number | null;
  answeredWithinMinutePct: number | null;
  won: number;
  revenue: number;
}

export interface Report {
  current: PeriodSummary & {
    spam: number;
    averageResponseSeconds: number | null;
    notAutoAnswered: number;
    conversionPct: number | null;
    wonWithoutValue: number;
  };
  previous: PeriodSummary;
  daily: { date: string; count: number }[];
  bucket: "day" | "week";
  bySource: { label: string; type: string; count: number }[];
  pipeline: { status: LeadStatus; label: string; count: number }[];
  replies: { kind: ReplyKind; count: number }[];
  repliesByChannel: { channel: string; count: number }[];
  customerReplies: number;
  followUps: { sent: number; leadsFollowedUp: number; repliedAfter: number };
  missedCalls: { total: number; turnedIntoConversation: number };
}

export async function buildReport(supabase: Supabase, orgId: string, period: ReportPeriod): Promise<Report> {
  const [leads, prevLeads, { data: sources }, events, inbound] = await Promise.all([
    fetchLeadsInRange(supabase, orgId, period.start, period.end),
    fetchLeadsInRange(supabase, orgId, period.prevStart, period.prevEnd),
    supabase.from("lead_sources").select("id, name, type").eq("org_id", orgId),
    fetchAll<SentEvent>((from, to) =>
      supabase
        .from("lead_events")
        .select("lead_id, type, payload, created_at")
        .eq("org_id", orgId)
        .in("type", ["sms_sent", "email_sent", "whatsapp_sent"])
        .gte("created_at", period.start.toISOString())
        .lt("created_at", period.end.toISOString())
        .order("created_at", { ascending: true })
        .range(from, to)
    ),
    fetchAll<InboundMessage>((from, to) =>
      supabase
        .from("messages")
        .select("lead_id, created_at")
        .eq("org_id", orgId)
        .eq("direction", "inbound")
        .gte("created_at", period.start.toISOString())
        .lt("created_at", period.end.toISOString())
        .order("created_at", { ascending: true })
        .range(from, to)
    ),
  ]);

  const sourceById = new Map(
    ((sources ?? []) as Pick<LeadSource, "id" | "name" | "type">[]).map((s) => [s.id, s])
  );

  // --- headline numbers -----------------------------------------------------
  const real = leads.filter((l) => l.status !== "spam");
  const current = summarize(real);
  const responseTimes = real.map((l) => l.first_response_seconds).filter((s): s is number => s != null);

  // --- leads over time ------------------------------------------------------
  const dayCount = daysBetween(period.startDate, period.endDate) + 1;
  const bucket: Report["bucket"] = dayCount > 62 ? "week" : "day";
  const counts = new Map<string, number>();
  for (let i = 0; i < dayCount; i += bucket === "day" ? 1 : 7) {
    counts.set(addDays(period.startDate, i), 0);
  }
  for (const lead of real) {
    const day = localDate(new Date(lead.created_at), period.timezone);
    const key =
      bucket === "day" ? day : addDays(period.startDate, Math.floor(daysBetween(period.startDate, day) / 7) * 7);
    if (counts.has(key)) counts.set(key, counts.get(key)! + 1);
  }

  // --- sources ----------------------------------------------------------------
  const sourceCounts = new Map<string, { label: string; type: string; count: number }>();
  for (const lead of real) {
    const source = lead.source_id ? sourceById.get(lead.source_id) : undefined;
    const id = source?.id ?? "none";
    const entry = sourceCounts.get(id) ?? {
      label: source?.name ?? "Other / unknown",
      type: source?.type ?? "manual",
      count: 0,
    };
    entry.count += 1;
    sourceCounts.set(id, entry);
  }

  // --- replies sent -------------------------------------------------------------
  const replyCounts: Record<ReplyKind, number> = { ai: 0, template: 0, followup: 0, team: 0 };
  const channelCounts = new Map<string, number>();
  const firstFollowUpAt = new Map<string, string>();
  for (const event of events) {
    const payload = (event.payload ?? {}) as { ok?: boolean; ai?: boolean; sequence?: boolean; manual?: boolean };
    if (payload.ok === false) continue;
    const kind: ReplyKind = payload.manual
      ? "team"
      : payload.sequence
        ? "followup"
        : payload.ai
          ? "ai"
          : "template";
    replyCounts[kind] += 1;
    const channel = event.type.replace(/_sent$/, "");
    channelCounts.set(channel, (channelCounts.get(channel) ?? 0) + 1);
    if (kind === "followup" && !firstFollowUpAt.has(event.lead_id)) {
      firstFollowUpAt.set(event.lead_id, event.created_at);
    }
  }

  // --- follow-ups & missed calls ----------------------------------------------
  const inboundByLead = new Map<string, string[]>();
  for (const message of inbound) {
    if (!message.lead_id) continue;
    const list = inboundByLead.get(message.lead_id) ?? [];
    list.push(message.created_at);
    inboundByLead.set(message.lead_id, list);
  }
  let repliedAfter = 0;
  for (const [leadId, followUpAt] of firstFollowUpAt) {
    if ((inboundByLead.get(leadId) ?? []).some((at) => at > followUpAt)) repliedAfter += 1;
  }

  const missedCallLeads = real.filter((l) => l.source_id && sourceById.get(l.source_id)?.type === "missed_call");

  return {
    current: {
      ...current,
      spam: leads.length - real.length,
      averageResponseSeconds: responseTimes.length
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : null,
      notAutoAnswered: real.length - responseTimes.length,
      conversionPct: real.length ? (current.won / real.length) * 100 : null,
      wonWithoutValue: real.filter((l) => l.status === "won" && dealValue(l) == null).length,
    },
    previous: summarize(prevLeads.filter((l) => l.status !== "spam")),
    daily: [...counts].map(([date, count]) => ({ date, count })),
    bucket,
    bySource: [...sourceCounts.values()].sort((a, b) => b.count - a.count),
    pipeline: PIPELINE.map((p) => ({ ...p, count: leads.filter((l) => l.status === p.status).length })),
    replies: (Object.keys(replyCounts) as ReplyKind[]).map((kind) => ({ kind, count: replyCounts[kind] })),
    repliesByChannel: [...channelCounts]
      .map(([channel, count]) => ({ channel, count }))
      .sort((a, b) => b.count - a.count),
    customerReplies: inbound.length,
    followUps: {
      sent: replyCounts.followup,
      leadsFollowedUp: firstFollowUpAt.size,
      repliedAfter,
    },
    missedCalls: {
      total: missedCallLeads.length,
      turnedIntoConversation: missedCallLeads.filter((l) => inboundByLead.has(l.id)).length,
    },
  };
}

function dealValue(lead: Lead): number | null {
  const value = (lead as { deal_value?: number | string | null }).deal_value;
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function summarize(leads: Lead[]): PeriodSummary {
  const times = leads
    .map((l) => l.first_response_seconds)
    .filter((s): s is number => s != null)
    .sort((a, b) => a - b);
  const won = leads.filter((l) => l.status === "won");
  return {
    leads: leads.length,
    medianResponseSeconds: times.length ? median(times) : null,
    // Share of ALL leads (unanswered ones count against it), not just answered ones.
    answeredWithinMinutePct: leads.length ? (times.filter((s) => s <= 60).length / leads.length) * 100 : null,
    won: won.length,
    revenue: won.reduce((sum, l) => sum + (dealValue(l) ?? 0), 0),
  };
}

function median(sorted: number[]) {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
