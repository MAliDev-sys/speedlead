import "server-only";
import { Resend } from "resend";
import nodemailer, { type Transporter } from "nodemailer";
import { getEnv, hasResend, hasGmailSmtp } from "@/lib/env";

export interface SendEmailResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

let resendClient: Resend | null = null;

function getResendClient() {
  const env = getEnv();
  if (!hasResend(env)) return null;
  if (!resendClient) resendClient = new Resend(env.RESEND_API_KEY!);
  return resendClient;
}

let gmailTransport: Transporter | null = null;

function getGmailTransport() {
  const env = getEnv();
  if (!hasGmailSmtp(env)) return null;
  if (!gmailTransport) {
    gmailTransport = nodemailer.createTransport({
      service: "gmail",
      auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
    });
  }
  return gmailTransport;
}

/**
 * Sends an outbound email on behalf of a tenant, with the tenant's own
 * business email set as reply-to so replies go straight to them, and the
 * tenant's own business name as the display name — a customer who
 * contacted "Ak Roofing" should see a reply from "Ak Roofing", not a
 * third-party platform name they don't recognize. That mismatch is both
 * a trust problem and a spam-filter red flag (reads as impersonation).
 *
 * Prefers Gmail SMTP over Resend when both are configured: Resend's
 * shared `onboarding@resend.dev` sender can only deliver to the Resend
 * account's own email until a verified domain is added (confirmed via a
 * failed delivery — see git history), which blocks every real customer.
 * A regular Gmail account's SMTP has no such restriction — it can email
 * anyone, same as normal personal email — at the cost of a lower daily
 * cap (~500/day on a free account) and weaker deliverability than a
 * properly authenticated custom domain (a brand-new Gmail sending
 * identity has zero reputation, so expect some spam-folder landings
 * until it's built up — a verified domain with SPF/DKIM/DMARC is the
 * real, durable fix; this is the free stopgap). Falls back to Resend if
 * Gmail isn't configured.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  fromName?: string;
}): Promise<SendEmailResult> {
  const env = getEnv();
  const fromName = params.fromName ?? "SpeedLead";

  const gmail = getGmailTransport();
  if (gmail) {
    try {
      const info = await gmail.sendMail({
        from: `"${fromName}" <${env.GMAIL_USER}>`,
        to: params.to,
        subject: params.subject,
        html: params.html,
        replyTo: params.replyTo,
      });
      return { ok: true, providerMessageId: info.messageId };
    } catch (err) {
      const error = err instanceof Error ? err.message : "unknown_error";
      console.error("[email] Gmail SMTP send failed", error);
      return { ok: false, error };
    }
  }

  const resend = getResendClient();
  if (!resend) {
    console.warn("[email] No email sender configured (Gmail or Resend) — skipping send.", params);
    return { ok: false, error: "email_not_configured" };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: `"${fromName}" <${extractAddress(env.RESEND_FROM_EMAIL!)}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, providerMessageId: data?.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : "unknown_error";
    console.error("[email] Resend send failed", error);
    return { ok: false, error };
  }
}

/** Pulls the bare address out of "Name <address>", or returns it unchanged. */
function extractAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return match ? match[1] : raw;
}

export interface ReceivedEmail {
  from: string;
  subject: string;
  text: string | null;
  html: string | null;
}

export interface GetReceivedEmailResult {
  email: ReceivedEmail | null;
  error?: string;
}

/**
 * Fetches the full content of an inbound email. The `email.received`
 * webhook payload only carries metadata (from/to/subject/attachment
 * names) — the body has to be retrieved separately. See
 * api/webhooks/resend/route.ts, the only caller.
 *
 * Always goes through Resend regardless of GMAIL_* config — inbound
 * receiving isn't subject to the outbound sending-domain restriction, so
 * there's no reason to move it off Resend (which already works well
 * here — see RESEND_INBOUND_DOMAIN in docs/SETUP.md).
 *
 * Returns the underlying error message on failure (rather than just
 * null) so the caller can put it in the HTTP response body — Resend's
 * dashboard shows each webhook delivery's response body directly, which
 * is a much faster diagnostic loop than digging through Vercel logs.
 */
export async function getReceivedEmail(id: string): Promise<GetReceivedEmailResult> {
  const resend = getResendClient();
  if (!resend) return { email: null, error: "resend_not_configured" };

  try {
    const { data, error } = await resend.emails.receiving.get(id);
    if (error || !data) {
      const message = error?.message ?? "no data returned";
      console.error("[email] getReceivedEmail failed", message);
      return { email: null, error: message };
    }
    return { email: { from: data.from, subject: data.subject, text: data.text, html: data.html } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] getReceivedEmail failed", message);
    return { email: null, error: message };
  }
}
