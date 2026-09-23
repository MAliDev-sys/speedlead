import { Webhook } from "standardwebhooks";
import { getLeadSourceByToken, createLeadAndNotify, LeadValidationError } from "@/lib/leads";
import { createAdminClient } from "@/lib/supabase/admin";
import { getReceivedEmail, sendEmail } from "@/lib/notify/email";
import { sendSlackLeadAlert } from "@/lib/notify/slack";
import { generateAiReply, fallbackFollowUpReply } from "@/lib/ai-respond";
import { getConversationHistory, stripHtml } from "@/lib/conversation";
import { getEnv, hasResendInbound, hasGmailSmtp, hasTwilio } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Diagnostic — GET this same URL in a browser to see exactly what this
 * deployment currently has configured, without exposing secret values.
 * Use this instead of guessing whether a Vercel env var actually saved:
 * it reads process.env live, on the deployment that's actually running.
 */
export async function GET() {
  const env = getEnv();
  return Response.json({
    resend_api_key_set: Boolean(env.RESEND_API_KEY),
    resend_from_email_set: Boolean(env.RESEND_FROM_EMAIL),
    resend_inbound_domain: env.RESEND_INBOUND_DOMAIN ?? null,
    resend_webhook_secret_set: Boolean(env.RESEND_WEBHOOK_SECRET),
    fully_configured: hasResendInbound(env),
    // Which sender outbound email actually uses right now (see
    // lib/notify/email.ts): Gmail is preferred when configured, else
    // Resend. If gmail_user shows your address but gmail_smtp_configured
    // is false, GMAIL_APP_PASSWORD didn't save correctly.
    gmail_user: env.GMAIL_USER ?? null,
    gmail_app_password_length: env.GMAIL_APP_PASSWORD?.length ?? 0,
    gmail_smtp_configured: hasGmailSmtp(env),
    // If both lengths are 0, the env vars didn't save on THIS deployment —
    // re-check Settings → Environment Variables in Vercel, specifically
    // that both are checked for the "Production" environment, not just
    // Preview/Development, then trigger a new deployment.
    twilio_account_sid_length: env.TWILIO_ACCOUNT_SID?.length ?? 0,
    twilio_auth_token_length: env.TWILIO_AUTH_TOKEN?.length ?? 0,
    twilio_configured: hasTwilio(env),
  });
}

/**
 * Inbound email intake: POST /api/webhooks/resend
 *
 * A customer emailing the business directly is a lead source too, not
 * just forms/webhooks/missed-calls. Each org gets a dedicated address —
 * `{lead_sources.public_token}@{RESEND_INBOUND_DOMAIN}` (an 'email'-type
 * lead source, auto-created at signup — see app/actions/orgs.ts) — shown
 * in Settings → Integrations. Point customers at it, or set up mail
 * forwarding from the business's existing inbox to it.
 *
 * Configure this URL as a "received mail" webhook in Resend's dashboard
 * (Emails → Receiving) once RESEND_INBOUND_DOMAIN is set up — see
 * docs/SETUP.md. The webhook payload only carries metadata (no body), so
 * this fetches the full email via the Receiving API once verified.
 *
 * Threading: if this sender already has a lead for this org, this is a
 * reply in an ongoing conversation, not a new inquiry — it's logged onto
 * the existing lead (with conversation-aware AI reply, same as the SMS
 * webhook) instead of spawning a duplicate lead and re-firing the full
 * multi-channel "new lead" blast.
 */
export async function POST(request: Request) {
  const env = getEnv();
  if (!hasResendInbound(env)) {
    return new Response("Inbound email not configured.", { status: 501 });
  }

  const rawBody = await request.text();
  // Resend's webhook delivery runs on Svix, which sends `svix-id` /
  // `svix-timestamp` / `svix-signature` on the wire (confirmed via a
  // failed delivery: Resend's own event IDs are `msg_...`, Svix's
  // convention) — but the `standardwebhooks` library's `verify()` only
  // recognizes keys literally named `webhook-id` etc. in the object we
  // pass it, so map one to the other rather than reading `webhook-*`
  // directly off the request.
  const webhookId = request.headers.get("svix-id") ?? request.headers.get("webhook-id");
  const webhookTimestamp =
    request.headers.get("svix-timestamp") ?? request.headers.get("webhook-timestamp");
  const webhookSignature =
    request.headers.get("svix-signature") ?? request.headers.get("webhook-signature");

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return new Response("Missing webhook signature headers.", { status: 400 });
  }

  let payload: { type: string; data: Record<string, unknown> };
  try {
    const webhook = new Webhook(env.RESEND_WEBHOOK_SECRET!);
    payload = webhook.verify(rawBody, {
      "webhook-id": webhookId,
      "webhook-timestamp": webhookTimestamp,
      "webhook-signature": webhookSignature,
    }) as typeof payload;
  } catch (err) {
    console.error("[webhooks/resend] signature verification failed", err);
    return new Response("Invalid signature.", { status: 403 });
  }

  // Only "email.received" is expected (that's the only event this webhook
  // should be subscribed to in Resend), but ignore anything else quietly
  // rather than erroring if the subscription is ever broadened.
  if (payload.type !== "email.received") {
    return new Response("ok", { status: 200 });
  }

  const emailId = String(payload.data.email_id ?? "");
  const toAddresses = Array.isArray(payload.data.to) ? (payload.data.to as string[]) : [];

  const inboundDomain = env.RESEND_INBOUND_DOMAIN!.toLowerCase();
  const matchedTo = toAddresses.find((addr) => addr.toLowerCase().endsWith(`@${inboundDomain}`));
  const token = matchedTo?.split("@")[0];

  if (!token) {
    console.warn("[webhooks/resend] no matching inbound address in", toAddresses);
    return new Response("ok", { status: 200 }); // not ours — don't 4xx a webhook we don't control retries for
  }

  const lookup = await getLeadSourceByToken(token);
  if (!lookup) {
    console.warn(`[webhooks/resend] unknown lead source token: ${token}`);
    return new Response("ok", { status: 200 });
  }

  const { email, error: fetchError } = await getReceivedEmail(emailId);
  if (!email) {
    return new Response(`Failed to fetch email content: ${fetchError ?? "unknown error"}`, {
      status: 502,
    });
  }

  const { name, email: fromEmail } = parseFromHeader(email.from);
  const message = email.text?.trim() || stripHtml(email.html) || `(No body) Subject: ${email.subject}`;

  const admin = createAdminClient();
  const { org } = lookup;

  const { data: existingLead } = await admin
    .from("leads")
    .select("id, status")
    .eq("org_id", org.id)
    .eq("email", fromEmail)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingLead) {
    await handleReply({ admin, org, leadId: existingLead.id, leadStatus: existingLead.status, fromEmail, message });
    return new Response("ok", { status: 200 });
  }

  try {
    await createLeadAndNotify(lookup.source, org, {
      name,
      email: fromEmail,
      message,
      raw_payload: { subject: email.subject, from: email.from } as never,
    });
  } catch (err) {
    if (err instanceof LeadValidationError) {
      return new Response(err.message, { status: 422 });
    }
    console.error("[webhooks/resend] failed to create lead", err);
    return new Response("Internal error.", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * A follow-up email from a sender who already has a lead: log it onto
 * that lead, ping Slack, and — in AI mode — reply with full conversation
 * memory. Mirrors webhooks/twilio/sms's reply handling; deliberately
 * does NOT re-run the full multi-channel notifyNewLead() blast, since
 * this isn't a new inquiry.
 */
async function handleReply(params: {
  admin: AdminClient;
  org: { id: string; name: string; alert_email: string | null; auto_respond_mode: string; ai_context: string | null; business_type: string | null };
  leadId: string;
  leadStatus: string;
  fromEmail: string;
  message: string;
}) {
  const { admin, org, leadId, leadStatus, fromEmail, message } = params;
  const env = getEnv();

  // History before logging this message, so the AI sees "everything
  // said before" separately from "the new message" rather than double-
  // counting it.
  const history = await getConversationHistory(leadId);

  await admin.from("messages").insert({
    org_id: org.id,
    lead_id: leadId,
    channel: "email",
    direction: "inbound",
    from_address: fromEmail,
    body: message,
    status: "received",
  });

  if (leadStatus === "new" || leadStatus === "contacted") {
    await admin.from("leads").update({ status: "responded" }).eq("id", leadId);
  }

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

  if (webhookUrl) {
    await sendSlackLeadAlert({
      webhookUrl,
      orgName: org.name,
      leadName: null,
      leadPhone: null,
      leadEmail: fromEmail,
      leadMessage: `💬 Reply: "${message}"`,
      source: "Email reply",
      leadUrl: `${env.NEXT_PUBLIC_APP_URL}/leads/${leadId}`,
    });
  }

  // Guaranteed reply on every follow-up, same as the first-touch flow:
  // try AI when it's on, but always fall back to a plain acknowledgment
  // rather than sending nothing if AI mode is off or the call fails.
  const aiReply =
    org.auto_respond_mode === "ai"
      ? await generateAiReply({
          businessName: org.name,
          businessType: org.business_type,
          aiContext: org.ai_context,
          history,
          customerMessage: message,
          channel: "email",
        })
      : null;
  const replyText = aiReply ?? fallbackFollowUpReply(org.name);

  const res = await sendEmail({
    orgId: org.id,
    to: fromEmail,
    subject: `Re: your request to ${org.name}`,
    html: `<p>${escapeHtml(replyText)}</p>`,
    replyTo: org.alert_email ?? undefined,
    fromName: org.name,
  });

  await admin.from("messages").insert({
    org_id: org.id,
    lead_id: leadId,
    channel: "email",
    direction: "outbound",
    to_address: fromEmail,
    body: replyText,
    status: res.ok ? "sent" : "failed",
    error: res.error ?? null,
    provider_message_id: res.providerMessageId ?? null,
  });
  await admin.from("lead_events").insert({
    org_id: org.id,
    lead_id: leadId,
    type: "email_sent",
    payload: { ok: res.ok, error: res.error ?? null, ai: Boolean(aiReply) },
  });
}

/** Splits `"Jane Doe <jane@example.com>"` (or a bare address) into parts. */
function parseFromHeader(from: string): { name: string | null; email: string } {
  const match = from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (match) {
    const name = match[1].trim();
    return { name: name || null, email: match[2].trim() };
  }
  return { name: null, email: from.trim() };
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
