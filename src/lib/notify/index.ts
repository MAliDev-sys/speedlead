import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnv } from "@/lib/env";
import { sendSms } from "./sms";
import { sendEmail } from "./email";
import { sendSlackLeadAlert } from "./slack";
import { sendWhatsApp } from "./whatsapp";
import type { Lead, Organization } from "@/lib/types/database";

type AdminClient = ReturnType<typeof createAdminClient>;

const DEFAULT_CHANNELS = ["sms", "email", "slack"] as const;

/**
 * The core of the product: fires the instant, multi-channel response the
 * moment a lead is created. Called SYNCHRONOUSLY from every intake path
 * (webhook, form, missed-call) — this is what "speed to lead" means, so it
 * must not be deferred to a queue. Each channel send is best-effort and
 * independently logged; one channel failing never blocks the others.
 *
 * After the instant response, schedules the org's active follow-up
 * sequence (if any) as rows in `scheduled_jobs`, to be picked up later by
 * the cron worker — that part IS fine to defer, since it's inherently a
 * delayed nurture step.
 */
export async function notifyNewLead(params: {
  lead: Lead;
  org: Organization;
  sourceName: string;
  channels?: readonly string[];
}) {
  const admin = createAdminClient();
  const env = getEnv();
  const channels = params.channels ?? DEFAULT_CHANNELS;
  const { lead, org } = params;

  const leadUrl = `${env.NEXT_PUBLIC_APP_URL}/leads/${lead.id}`;
  let firstResponseChannel: string | null = null;

  const logMessage = async (row: {
    channel: "sms" | "email" | "whatsapp" | "slack";
    to: string;
    from?: string;
    body: string;
    ok: boolean;
    providerMessageId?: string;
    error?: string;
  }) => {
    await admin.from("messages").insert({
      org_id: org.id,
      lead_id: lead.id,
      channel: row.channel,
      direction: "outbound",
      to_address: row.to,
      from_address: row.from ?? null,
      body: row.body,
      provider_message_id: row.providerMessageId ?? null,
      status: row.ok ? "sent" : "failed",
      error: row.error ?? null,
    });
    await admin.from("lead_events").insert({
      org_id: org.id,
      lead_id: lead.id,
      type: `${row.channel}_sent`,
      payload: { ok: row.ok, error: row.error ?? null },
    });
    if (row.ok && !firstResponseChannel && row.channel !== "slack") {
      firstResponseChannel = row.channel;
    }
  };

  const firstName = lead.name?.split(" ")[0] || "there";
  const smsBody = `Hi ${firstName}, thanks for reaching out to ${org.name}! We got your request and someone will call you shortly. Reply STOP to opt out.`;
  const emailHtml = `<p>Hi ${firstName},</p><p>Thanks for reaching out to <strong>${org.name}</strong>! We received your request${
    lead.message ? `: "${escapeHtml(lead.message)}"` : ""
  } and a team member will contact you shortly.</p>`;

  const tasks: Promise<void>[] = [];

  if (channels.includes("sms") && lead.phone) {
    tasks.push(sendFromOrgNumber(admin, org, lead, smsBody, logMessage));
  }

  if (channels.includes("whatsapp") && lead.phone) {
    tasks.push(
      sendWhatsApp({ to: lead.phone, body: smsBody }).then((res) =>
        logMessage({
          channel: "whatsapp",
          to: lead.phone!,
          body: smsBody,
          ok: res.ok,
          providerMessageId: res.providerMessageId,
          error: res.error,
        })
      )
    );
  }

  if (channels.includes("email") && lead.email) {
    tasks.push(
      sendEmail({
        to: lead.email,
        subject: `We got your request — ${org.name}`,
        html: emailHtml,
        replyTo: org.alert_email ?? undefined,
      }).then((res) =>
        logMessage({
          channel: "email",
          to: lead.email!,
          body: emailHtml,
          ok: res.ok,
          providerMessageId: res.providerMessageId,
          error: res.error,
        })
      )
    );
  }

  if (channels.includes("slack")) {
    tasks.push(notifyTeamSlack(admin, org, lead, params.sourceName, leadUrl));
  }

  await Promise.all(tasks);

  if (firstResponseChannel) {
    const seconds = Math.max(
      0,
      Math.round((Date.now() - new Date(lead.created_at).getTime()) / 1000)
    );
    await admin
      .from("leads")
      .update({
        first_response_at: new Date().toISOString(),
        first_response_channel: firstResponseChannel,
        first_response_seconds: seconds,
        status: "contacted",
      })
      .eq("id", lead.id);
  }

  await scheduleFollowUps(admin, org, lead);
}

async function sendFromOrgNumber(
  admin: AdminClient,
  org: Organization,
  lead: Lead,
  body: string,
  logMessage: (row: {
    channel: "sms";
    to: string;
    from?: string;
    body: string;
    ok: boolean;
    providerMessageId?: string;
    error?: string;
  }) => Promise<void>
) {
  const { data: phoneRow } = await admin
    .from("phone_numbers")
    .select("phone_number")
    .eq("org_id", org.id)
    .limit(1)
    .maybeSingle();

  if (!phoneRow) {
    console.warn(`[notify] org ${org.id} has no phone_numbers row — skipping SMS.`);
    return;
  }

  const res = await sendSms({ from: phoneRow.phone_number, to: lead.phone!, body });
  await logMessage({
    channel: "sms",
    to: lead.phone!,
    from: phoneRow.phone_number,
    body,
    ok: res.ok,
    providerMessageId: res.providerMessageId,
    error: res.error,
  });
}

async function notifyTeamSlack(
  admin: AdminClient,
  org: Organization,
  lead: Lead,
  sourceName: string,
  leadUrl: string
) {
  const { data: integration } = await admin
    .from("integrations")
    .select("config, status")
    .eq("org_id", org.id)
    .eq("type", "slack")
    .maybeSingle();

  const webhookUrl =
    integration?.status === "connected" &&
    integration.config &&
    typeof integration.config === "object" &&
    "webhook_url" in integration.config
      ? String((integration.config as Record<string, unknown>).webhook_url)
      : null;

  if (!webhookUrl) return;

  const res = await sendSlackLeadAlert({
    webhookUrl,
    orgName: org.name,
    leadName: lead.name,
    leadPhone: lead.phone,
    leadEmail: lead.email,
    leadMessage: lead.message,
    source: sourceName,
    leadUrl,
  });

  await admin.from("lead_events").insert({
    org_id: org.id,
    lead_id: lead.id,
    type: "slack_notified",
    payload: { ok: res.ok, error: res.error ?? null },
  });
}

/** Schedules the org's active follow-up sequence steps for a new lead. */
async function scheduleFollowUps(admin: AdminClient, org: Organization, lead: Lead) {
  const { data: sequence } = await admin
    .from("sequences")
    .select("id, steps")
    .eq("org_id", org.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!sequence || !Array.isArray(sequence.steps)) return;

  const jobs = (sequence.steps as Array<{ delay_minutes: number; channel: string; template: string }>).map(
    (step) => ({
      org_id: org.id,
      lead_id: lead.id,
      type: "sequence_step",
      payload: { channel: step.channel, template: step.template, sequence_id: sequence.id },
      run_at: new Date(Date.now() + step.delay_minutes * 60_000).toISOString(),
    })
  );

  if (jobs.length > 0) {
    await admin.from("scheduled_jobs").insert(jobs);
  }
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
