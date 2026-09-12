import { Webhook } from "standardwebhooks";
import { getLeadSourceByToken, createLeadAndNotify, LeadValidationError } from "@/lib/leads";
import { getReceivedEmail } from "@/lib/notify/email";
import { getEnv, hasResendInbound } from "@/lib/env";

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
 */
export async function POST(request: Request) {
  const env = getEnv();
  if (!hasResendInbound(env)) {
    return new Response("Inbound email not configured.", { status: 501 });
  }

  const rawBody = await request.text();
  const webhookId = request.headers.get("webhook-id");
  const webhookTimestamp = request.headers.get("webhook-timestamp");
  const webhookSignature = request.headers.get("webhook-signature");

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

  const email = await getReceivedEmail(emailId);
  if (!email) {
    return new Response("Failed to fetch email content.", { status: 502 });
  }

  const { name, email: fromEmail } = parseFromHeader(email.from);
  const message = email.text?.trim() || stripHtml(email.html) || `(No body) Subject: ${email.subject}`;

  try {
    await createLeadAndNotify(lookup.source, lookup.org, {
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

/** Splits `"Jane Doe <jane@example.com>"` (or a bare address) into parts. */
function parseFromHeader(from: string): { name: string | null; email: string } {
  const match = from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (match) {
    const name = match[1].trim();
    return { name: name || null, email: match[2].trim() };
  }
  return { name: null, email: from.trim() };
}

function stripHtml(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
