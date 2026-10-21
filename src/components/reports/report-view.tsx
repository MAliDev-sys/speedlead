import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Download,
  Inbox,
  MessageSquareReply,
  PhoneMissed,
  RefreshCw,
  Send,
  Target,
  Timer,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  PERIOD_PRESETS,
  REPLY_KIND_LABELS,
  SOURCE_TYPE_LABELS,
  formatDate,
  type Report,
  type ReportPeriod,
} from "@/lib/reports";

/** The Reports page body (app/reports), split out from data loading. */
export function ReportView({ period, report }: { period: ReportPeriod; report: Report }) {
  const { current, previous } = report;

  const exportQuery = new URLSearchParams(
    period.key === "custom"
      ? { period: "custom", from: period.startDate, to: period.endDate }
      : { period: period.key }
  ).toString();

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Reports</h1>
          <p className="mt-1 text-sm text-slate-500">
            {formatDate(period.startDate)} – {formatDate(period.endDate)} · compared with {period.compareLabel} ·{" "}
            {period.timezone.replace(/_/g, " ")} time
          </p>
        </div>
        <a
          href={`/reports/export?${exportQuery}`}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
        >
          <Download className="h-4 w-4" />
          Export leads (CSV)
        </a>
      </section>

      <PeriodPicker period={period} />

      {period.notice ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{period.notice}</p>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile
          icon={Inbox}
          label="Leads received"
          value={formatCount(current.leads)}
          delta={delta(current.leads, previous.leads)}
          note={current.spam ? `${current.spam} spam not counted` : undefined}
        />
        <KpiTile
          icon={Timer}
          label="Median first response"
          value={current.medianResponseSeconds != null ? formatDuration(current.medianResponseSeconds) : "—"}
          delta={delta(current.medianResponseSeconds, previous.medianResponseSeconds, "lower")}
          note={
            current.averageResponseSeconds != null
              ? `Average ${formatDuration(current.averageResponseSeconds)}`
              : undefined
          }
        />
        <KpiTile
          icon={Zap}
          label="Answered within 1 minute"
          value={current.answeredWithinMinutePct != null ? formatPct(current.answeredWithinMinutePct) : "—"}
          delta={delta(current.answeredWithinMinutePct, previous.answeredWithinMinutePct, "higher", "points")}
          note={current.notAutoAnswered ? `${current.notAutoAnswered} not answered automatically` : undefined}
        />
        <KpiTile
          icon={Trophy}
          label="Jobs won"
          value={formatCount(current.won)}
          delta={delta(current.won, previous.won)}
          note={current.conversionPct != null ? `${formatPct(current.conversionPct)} of leads` : undefined}
        />
        <KpiTile
          icon={Target}
          label="Revenue won"
          value={formatMoney(current.revenue)}
          delta={delta(current.revenue, previous.revenue)}
          note={
            current.wonWithoutValue
              ? `${current.wonWithoutValue} won lead${current.wonWithoutValue === 1 ? "" : "s"} missing a job value`
              : undefined
          }
        />
      </section>

      <Card
        title={report.bucket === "day" ? "Leads per day" : "Leads per week"}
        description="New leads received, excluding spam. Hover a bar for the exact number."
      >
        <LeadsChart report={report} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Where leads came from" description="Each connected lead source, busiest first.">
          {report.bySource.length ? (
            <BarList
              rows={report.bySource.map((s) => ({
                label: s.label,
                sublabel: SOURCE_TYPE_LABELS[s.type] ?? s.type,
                count: s.count,
              }))}
              total={current.leads}
            />
          ) : (
            <Empty text="No leads in this period." />
          )}
        </Card>

        <Card
          title="Lead pipeline"
          description="Where this period's leads stand right now. Change a lead's status on its page."
        >
          <BarList
            rows={report.pipeline.map((p) => ({ label: p.label, count: p.count }))}
            total={report.pipeline.reduce((sum, p) => sum + p.count, 0)}
          />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Replies sent" description="Every message that went out to a customer, by who wrote it.">
          {report.replies.some((r) => r.count) ? (
            <>
              <BarList
                rows={report.replies.map((r) => ({ label: REPLY_KIND_LABELS[r.kind], count: r.count }))}
                total={report.replies.reduce((sum, r) => sum + r.count, 0)}
              />
              <p className="mt-4 text-xs text-slate-500">
                By channel:{" "}
                {report.repliesByChannel
                  .map((c) => `${CHANNEL_LABELS[c.channel] ?? c.channel} ${formatCount(c.count)}`)
                  .join(" · ")}
              </p>
            </>
          ) : (
            <Empty text="No replies sent in this period." />
          )}
        </Card>

        <Card title="Conversations" description="What the instant replies and follow-ups led to.">
          <dl>
            <StatRow
              icon={MessageSquareReply}
              label="Customer replies received"
              value={formatCount(report.customerReplies)}
            />
            <StatRow
              icon={Send}
              label="Automatic follow-ups sent"
              value={formatCount(report.followUps.sent)}
              detail={
                report.followUps.leadsFollowedUp
                  ? `to ${formatCount(report.followUps.leadsFollowedUp)} lead${report.followUps.leadsFollowedUp === 1 ? "" : "s"}`
                  : undefined
              }
            />
            <StatRow
              icon={RefreshCw}
              label="Leads who replied after a follow-up"
              value={formatCount(report.followUps.repliedAfter)}
              detail={
                report.followUps.leadsFollowedUp
                  ? formatPct((report.followUps.repliedAfter / report.followUps.leadsFollowedUp) * 100)
                  : undefined
              }
            />
            <StatRow
              icon={PhoneMissed}
              label="Missed calls turned into conversations"
              value={`${formatCount(report.missedCalls.turnedIntoConversation)} of ${formatCount(report.missedCalls.total)}`}
              detail={report.missedCalls.total ? undefined : "No missed calls in this period"}
            />
          </dl>
        </Card>
      </div>
    </div>
  );
}

const CHANNEL_LABELS: Record<string, string> = { email: "Email", sms: "Text", whatsapp: "WhatsApp" };

// ---------------------------------------------------------------------------
// Period picker
// ---------------------------------------------------------------------------

function PeriodPicker({ period }: { period: ReportPeriod }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <nav className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1" aria-label="Report period">
        {PERIOD_PRESETS.map((preset) => {
          const active = period.key === preset.key;
          return (
            <Link
              key={preset.key}
              href={`/reports?period=${preset.key}`}
              aria-current={active ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                active ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {preset.label}
            </Link>
          );
        })}
      </nav>
      <form action="/reports" className="flex flex-wrap items-center gap-2 text-sm">
        <input type="hidden" name="period" value="custom" />
        <label className="sr-only" htmlFor="report-from">
          From
        </label>
        <input
          id="report-from"
          type="date"
          name="from"
          required
          defaultValue={period.key === "custom" ? period.startDate : undefined}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-700"
        />
        <span className="text-slate-400">to</span>
        <label className="sr-only" htmlFor="report-to">
          To
        </label>
        <input
          id="report-to"
          type="date"
          name="to"
          required
          defaultValue={period.key === "custom" ? period.endDate : undefined}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-700"
        />
        <button
          type="submit"
          className={`rounded-lg px-3 py-1.5 font-medium transition ${
            period.key === "custom"
              ? "bg-brand-600 text-white"
              : "border border-slate-300 text-slate-700 hover:bg-slate-100"
          }`}
        >
          Apply
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Card(props: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50">
      <h2 className="text-sm font-semibold text-slate-900">{props.title}</h2>
      <p className="mt-0.5 text-sm text-slate-500">{props.description}</p>
      <div className="mt-4">{props.children}</div>
    </section>
  );
}

interface Delta {
  text: string;
  direction: "up" | "down" | "flat";
  good: boolean | null;
}

/**
 * Change vs the comparison period. `better` says which direction is good
 * (response time: lower). `unit: "points"` reports a percentage-point
 * difference instead of a relative change (for metrics that are already %).
 */
function delta(
  now: number | null,
  before: number | null,
  better: "higher" | "lower" = "higher",
  unit: "relative" | "points" = "relative"
): Delta | null {
  if (now == null || before == null) return null;
  const diff = now - before;
  const direction = Math.abs(diff) < 1e-9 ? "flat" : diff > 0 ? "up" : "down";
  const good = direction === "flat" ? null : (direction === "up") === (better === "higher");
  if (unit === "points") {
    return { text: `${diff > 0 ? "+" : ""}${Math.round(diff)} pts`, direction, good };
  }
  if (before === 0) return now === 0 ? { text: "No change", direction: "flat", good: null } : { text: "New", direction: "up", good };
  const pct = (diff / before) * 100;
  return { text: direction === "flat" ? "No change" : `${pct > 0 ? "+" : ""}${Math.round(pct)}%`, direction, good };
}

function KpiTile(props: { icon: LucideIcon; label: string; value: string; delta: Delta | null; note?: string }) {
  const d = props.delta;
  const DeltaIcon = d?.direction === "down" ? ArrowDownRight : ArrowUpRight;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/50">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <props.icon className="h-3.5 w-3.5" strokeWidth={2} />
        {props.label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{props.value}</div>
      <div className="mt-1 min-h-4 text-xs">
        {d ? (
          <span
            className={`inline-flex items-center gap-0.5 font-medium ${
              d.good == null ? "text-slate-500" : d.good ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {d.direction !== "flat" ? <DeltaIcon className="h-3 w-3" aria-hidden /> : null}
            {d.text}
            <span className="sr-only">{d.good == null ? "" : d.good ? " (better)" : " (worse)"}</span>
          </span>
        ) : (
          <span className="text-slate-400">No earlier data</span>
        )}
      </div>
      {props.note ? <div className="mt-1 text-xs text-slate-400">{props.note}</div> : null}
    </div>
  );
}

function LeadsChart({ report }: { report: Report }) {
  const max = Math.max(1, ...report.daily.map((d) => d.count));
  const total = report.daily.reduce((sum, d) => sum + d.count, 0);
  const labelEvery = Math.ceil(report.daily.length / 8);
  const describe = (date: string) =>
    report.bucket === "day"
      ? formatDate(date, { weekday: "short", month: "short", day: "numeric" })
      : `Week of ${formatDate(date, { month: "short", day: "numeric" })}`;

  if (total === 0) return <Empty text="No leads in this period yet." />;

  return (
    <div>
      <div className="flex gap-2">
        <div className="flex h-40 flex-col justify-between pb-0.5 text-right text-[11px] tabular-nums text-slate-400" aria-hidden>
          <span>{max}</span>
          <span>0</span>
        </div>
        <div className="relative h-40 min-w-0 flex-1 border-b border-l border-slate-200">
          <div className="absolute inset-x-0 top-0 border-t border-dashed border-slate-100" aria-hidden />
          <ol className="absolute inset-0 flex items-end gap-0.5 px-1" aria-label="Leads over time">
            {report.daily.map((d) => (
              <li
                key={d.date}
                tabIndex={0}
                aria-label={`${describe(d.date)}: ${d.count} lead${d.count === 1 ? "" : "s"}`}
                className="group relative flex h-full flex-1 items-end justify-center outline-none"
              >
                {d.count > 0 ? (
                  <span
                    className="block w-full max-w-6 rounded-t bg-brand-500 transition group-hover:bg-brand-600 group-focus:bg-brand-600"
                    style={{ height: `${(d.count / max) * 100}%` }}
                  />
                ) : null}
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-xs text-white shadow-lg group-hover:block group-focus:block">
                  {describe(d.date)} · <strong>{d.count}</strong>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      {/* Labels are absolutely placed under their column so they never widen the
          row (a flex row of 31 unshrinkable labels overflowed phone screens);
          every other label hides on small screens to avoid collisions. */}
      <div className="relative ml-8 mt-1 h-4 text-[11px] text-slate-400" aria-hidden>
        {report.daily.map((d, i) =>
          i % labelEvery === 0 ? (
            <span
              key={d.date}
              className={`absolute top-0 -translate-x-1/2 whitespace-nowrap ${
                (i / labelEvery) % 2 === 1 ? "max-sm:hidden" : ""
              }`}
              style={{ left: `${((i + 0.5) / report.daily.length) * 100}%` }}
            >
              {formatDate(d.date, { month: "short", day: "numeric" })}
            </span>
          ) : null
        )}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-700">View as table</summary>
        <table className="mt-2 w-full max-w-sm text-left text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="py-1 font-medium">{report.bucket === "day" ? "Day" : "Week"}</th>
              <th className="py-1 text-right font-medium">Leads</th>
            </tr>
          </thead>
          <tbody className="text-slate-700">
            {report.daily.map((d) => (
              <tr key={d.date} className="border-t border-slate-100">
                <td className="py-1">{describe(d.date)}</td>
                <td className="py-1 text-right tabular-nums">{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function BarList(props: { rows: { label: string; sublabel?: string; count: number }[]; total: number }) {
  const max = Math.max(1, ...props.rows.map((r) => r.count));
  return (
    <ul className="space-y-3">
      {props.rows.map((row) => (
        <li key={`${row.label}-${row.sublabel ?? ""}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-700">
              {row.label}
              {row.sublabel && !sameWords(row.label, row.sublabel) ? (
                <span className="ml-1.5 text-xs text-slate-400">{row.sublabel}</span>
              ) : null}
            </span>
            <span className="shrink-0 tabular-nums text-slate-900">
              {formatCount(row.count)}
              <span className="ml-1.5 text-xs text-slate-400">
                {props.total ? formatPct((row.count / props.total) * 100) : "0%"}
              </span>
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-slate-100" aria-hidden>
            {row.count > 0 ? (
              <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(row.count / max) * 100}%` }} />
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** "Missed calls" vs "Missed call": a source named after its type needs no type hint. */
function sameWords(label: string, sublabel: string) {
  const firstWord = (s: string) => s.toLowerCase().split(/[^a-z]+/).find(Boolean) ?? "";
  return firstWord(label) === firstWord(sublabel);
}

function StatRow(props: { icon: LucideIcon; label: string; value: string; detail?: string }) {
  // Row borders, not divide-y: the dark theme overrides border colors on
  // the element itself, and divide-y draws them on the children.
  return (
    <div className="flex items-center gap-3 border-t border-slate-100 py-2.5 first:border-t-0">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <props.icon className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
      <dt className="min-w-0 flex-1 text-sm text-slate-600">{props.label}</dt>
      <dd className="text-right">
        <span className="text-sm font-semibold tabular-nums text-slate-900">{props.value}</span>
        {props.detail ? <span className="block text-xs text-slate-400">{props.detail}</span> : null}
      </dd>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-slate-400">{text}</p>;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatCount(n: number) {
  return new Intl.NumberFormat("en-US", { notation: n >= 10_000 ? "compact" : "standard" }).format(n);
}

function formatPct(n: number) {
  return `${Math.round(n)}%`;
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: n >= 100_000 ? "compact" : "standard",
    maximumFractionDigits: n >= 100_000 ? 1 : 0,
  }).format(n);
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s ? `${m}m ${s}s` : `${m}m`;
  }
  if (seconds < 86_400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.round(seconds / 86_400)}d`;
}
