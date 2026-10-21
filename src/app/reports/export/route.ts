import { requireCurrentOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { fetchLeadsInRange, localDate, resolvePeriod, SOURCE_TYPE_LABELS } from "@/lib/reports";
import type { LeadSource } from "@/lib/types/database";

export const dynamic = "force-dynamic";

/**
 * GET /reports/export?period=...&from=...&to=... — the leads behind the
 * Reports page for the same period, as a CSV for Excel/Google Sheets.
 * RLS-scoped through the session client like the page itself.
 */
export async function GET(request: Request) {
  const { org } = await requireCurrentOrg();
  const supabase = await createClient();
  const url = new URL(request.url);
  const period = resolvePeriod(
    {
      period: url.searchParams.get("period") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    },
    org.timezone
  );

  const [leads, { data: sources }] = await Promise.all([
    fetchLeadsInRange(supabase, org.id, period.start, period.end),
    supabase.from("lead_sources").select("id, name, type").eq("org_id", org.id),
  ]);
  const sourceById = new Map(
    ((sources ?? []) as Pick<LeadSource, "id" | "name" | "type">[]).map((s) => [s.id, s])
  );

  const timeFormat = new Intl.DateTimeFormat("en-GB", {
    timeZone: period.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const header = [
    "Received date",
    "Received time",
    "Name",
    "Email",
    "Phone",
    "Source",
    "Source type",
    "Status",
    "First response (seconds)",
    "First response channel",
    "Job value",
    "Message",
  ];
  const rows = leads.map((lead) => {
    const created = new Date(lead.created_at);
    const source = lead.source_id ? sourceById.get(lead.source_id) : undefined;
    return [
      localDate(created, period.timezone),
      timeFormat.format(created),
      lead.name,
      lead.email,
      lead.phone,
      source?.name,
      source ? (SOURCE_TYPE_LABELS[source.type] ?? source.type) : undefined,
      lead.status,
      lead.first_response_seconds,
      lead.first_response_channel,
      (lead as { deal_value?: number | null }).deal_value,
      lead.message,
    ];
  });

  // BOM so Excel opens UTF-8 (names, em dashes) correctly.
  const csv = "﻿" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const filename = `speedlead-leads-${period.startDate}-to-${period.endDate}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function csvCell(value: unknown) {
  if (value == null) return "";
  let text = String(value);
  // A cell starting with = + - @ runs as a formula in Excel/Sheets; lead
  // fields are customer-supplied, so neutralize them.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
