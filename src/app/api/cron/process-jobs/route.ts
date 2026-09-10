import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnv } from "@/lib/env";
import { sendSms } from "@/lib/notify/sms";
import { sendEmail } from "@/lib/notify/email";
import { sendWhatsApp } from "@/lib/notify/whatsapp";

export const dynamic = "force-dynamic";

const MAX_JOBS_PER_RUN = 50;
const MAX_ATTEMPTS = 3;

/**
 * Follow-up / drip-sequence worker: POST /api/cron/process-jobs
 *
 * NOT for the first response (that's synchronous — see lib/notify).
 * This only runs the *delayed* nurture steps scheduled by
 * notifyNewLead()'s scheduleFollowUps(). Call it every 1-5 minutes from an
 * external scheduler (cron-job.org, GitHub Actions cron, or Supabase
 * pg_cron) — see docs/SETUP.md. A few minutes of slack here is fine; it's
 * only the very first reply to a brand-new lead that has to be instant.
 */
export async function POST(request: Request) {
  const env = getEnv();
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 500 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: jobs, error } = await admin
    .from("scheduled_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("run_at", nowIso)
    .order("run_at", { ascending: true })
    .limit(MAX_JOBS_PER_RUN);

  if (error) {
    console.error("[cron/process-jobs] failed to fetch jobs", error);
    return NextResponse.json({ error: "Failed to fetch jobs." }, { status: 500 });
  }

  let processed = 0;
  let failed = 0;

  for (const job of jobs ?? []) {
    // Claim it first so a slow run and the next scheduled tick can't double-send.
    const { data: claimed } = await admin
      .from("scheduled_jobs")
      .update({ status: "processing", attempts: job.attempts + 1 })
      .eq("id", job.id)
      .eq("status", "pending")
      .select()
      .maybeSingle();

    if (!claimed) continue; // another run already claimed it

    try {
      await runJob(admin, claimed);
      await admin.from("scheduled_jobs").update({ status: "done" }).eq("id", claimed.id);
      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown_error";
      const willRetry = claimed.attempts < MAX_ATTEMPTS;
      await admin
        .from("scheduled_jobs")
        .update({
          status: willRetry ? "pending" : "failed",
          last_error: message,
          // back off the retry by a few minutes rather than hammering it next tick
          run_at: willRetry ? new Date(Date.now() + 5 * 60_000).toISOString() : claimed.run_at,
        })
        .eq("id", claimed.id);
      failed++;
      console.error(`[cron/process-jobs] job ${claimed.id} failed`, message);
    }
  }

  return NextResponse.json({ processed, failed, total: jobs?.length ?? 0 });
}

type AdminClient = ReturnType<typeof createAdminClient>;
type Job = { id: string; org_id: string; lead_id: string | null; type: string; payload: unknown };

async function runJob(admin: AdminClient, job: Job) {
  if (job.type !== "sequence_step" || !job.lead_id) return;

  const { data: lead } = await admin.from("leads").select("*").eq("id", job.lead_id).maybeSingle();
  if (!lead) return;

  // Lead already responded/was closed out — the DB trigger cancels most of
  // these, but re-check in case this job was already in flight when that happened.
  if (!["new", "contacted"].includes(lead.status)) return;

  const { data: org } = await admin.from("organizations").select("*").eq("id", job.org_id).maybeSingle();
  if (!org) return;

  const payload = job.payload as { channel: string; template: string };
  const message = renderTemplate(payload.template, { name: lead.name?.split(" ")[0] || "there", org_name: org.name });

  if (payload.channel === "sms" && lead.phone) {
    const { data: phoneRow } = await admin
      .from("phone_numbers")
      .select("phone_number")
      .eq("org_id", org.id)
      .limit(1)
      .maybeSingle();
    if (phoneRow) {
      const res = await sendSms({ from: phoneRow.phone_number, to: lead.phone, body: message });
      await logResult(admin, org.id, lead.id, "sms", lead.phone, message, res.ok, res.error, res.providerMessageId);
    }
  } else if (payload.channel === "whatsapp" && lead.phone) {
    const res = await sendWhatsApp({ to: lead.phone, body: message });
    await logResult(admin, org.id, lead.id, "whatsapp", lead.phone, message, res.ok, res.error, res.providerMessageId);
  } else if (payload.channel === "email" && lead.email) {
    const res = await sendEmail({
      to: lead.email,
      subject: `Following up — ${org.name}`,
      html: `<p>${message}</p>`,
      replyTo: org.alert_email ?? undefined,
    });
    await logResult(admin, org.id, lead.id, "email", lead.email, message, res.ok, res.error, res.providerMessageId);
  }
}

async function logResult(
  admin: AdminClient,
  orgId: string,
  leadId: string,
  channel: "sms" | "email" | "whatsapp",
  to: string,
  body: string,
  ok: boolean,
  error?: string,
  providerMessageId?: string
) {
  await admin.from("messages").insert({
    org_id: orgId,
    lead_id: leadId,
    channel,
    direction: "outbound",
    to_address: to,
    body,
    status: ok ? "sent" : "failed",
    error: error ?? null,
    provider_message_id: providerMessageId ?? null,
  });
  await admin.from("lead_events").insert({
    org_id: orgId,
    lead_id: leadId,
    type: `${channel}_sent`,
    payload: { ok, error: error ?? null, sequence: true },
  });
}

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => vars[key] ?? "");
}
