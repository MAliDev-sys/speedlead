import "server-only";
import { Resend } from "resend";
import nodemailer, { type Transporter } from "nodemailer";
import { getEnv, hasResend, hasGmailSmtp } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

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

interface OrgEmailConfig {
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
}

/**
 * A client's own email credentials (their business Gmail, Outlook, or
 * domain mailbox), saved under Settings → Integrations → Email sending
 * (see components/settings/email-sending-form.tsx). Returns null if
 * unset or incomplete, so the caller falls back to the platform sender —
 * this lookup should never be the reason a lead reply fails to go out.
 */
async function getOrgEmailConfig(orgId: string): Promise<OrgEmailConfig | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("integrations")
      .select("config, status")
      .eq("org_id", orgId)
      .eq("type", "email")
      .maybeSingle();

    if (data?.status !== "connected" || !data.config || typeof data.config !== "object") {
      return null;
    }
    const config = data.config as Record<string, unknown>;
    if (!config.from_email || !config.smtp_host || !config.smtp_user || !config.smtp_pass) {
      return null;
    }
    return {
      fromEmail: String(config.from_email),
      smtpHost: String(config.smtp_host),
      smtpPort: Number(config.smtp_port) || 587,
      smtpUser: String(config.smtp_user),
      smtpPass: String(config.smtp_pass),
    };
  } catch (err) {
    console.warn("[email] getOrgEmailConfig lookup failed", err);
    return null;
  }
}

/**
 * The address a lead reply email should set as Reply-To — this org's own
 * dedicated inbound address (`{token}@{RESEND_INBOUND_DOMAIN}`), NOT
 * `org.alert_email`. A customer hitting "Reply" in their email client
 * sends wherever Reply-To points; pointing that at alert_email (a
 * personal mailbox nobody's watching programmatically) meant every
 * in-thread reply silently vanished instead of reaching this app —
 * no AI conversation memory, no follow-up threading, nothing, because
 * the message never arrived here to begin with (confirmed via live
 * testing: a customer replying in-thread got no response, while a fresh
 * email to the dedicated address worked fine). Falls back to
 * `alertEmail` if inbound email isn't set up on this deployment/org, so
 * behavior doesn't regress where it was already the only option.
 */
export async function getReplyToAddress(orgId: string, alertEmail: string | null): Promise<string | undefined> {
  const env = getEnv();
  if (env.RESEND_INBOUND_DOMAIN) {
    const admin = createAdminClient();
    const { data: source } = await admin
      .from("lead_sources")
      .select("public_token")
      .eq("org_id", orgId)
      .eq("type", "email")
      .maybeSingle();
    if (source) return `${source.public_token}@${env.RESEND_INBOUND_DOMAIN}`;
  }
  return alertEmail ?? undefined;
}

/**
 * Sends an outbound email on behalf of a tenant, with the tenant's own
 * business email set as reply-to so replies go straight to them, and the
 * tenant's own business name as the display name — a customer who
 * contacted "Ak Roofing" should see a reply from "Ak Roofing", not a
 * third-party platform name they don't recognize. That mismatch is both
 * a trust problem and a spam-filter red flag (reads as impersonation).
 *
 * Sender priority, each falling through to the next on any failure so a
 * misconfiguration never blocks a lead reply from going out at all:
 *   1. The org's own email credentials, if they've connected one
 *      (Settings → Integrations → Email sending) — replies then come
 *      from their real business address/domain, not a platform one.
 *   2. The platform's shared Gmail SMTP, when configured — Resend's
 *      shared `onboarding@resend.dev` sender can only deliver to the
 *      Resend account's own email until a verified domain is added
 *      (confirmed via a failed delivery — see git history), which
 *      blocks every real customer; Gmail has no such restriction.
 *   3. The platform's shared Resend sender, as a last resort.
 */
export async function sendEmail(params: {
  orgId: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  fromName?: string;
}): Promise<SendEmailResult> {
  const fromName = params.fromName ?? "SpeedLead";

  const orgConfig = await getOrgEmailConfig(params.orgId);
  if (orgConfig) {
    try {
      const transport = nodemailer.createTransport({
        host: orgConfig.smtpHost,
        port: orgConfig.smtpPort,
        secure: orgConfig.smtpPort === 465,
        auth: { user: orgConfig.smtpUser, pass: orgConfig.smtpPass },
      });
      const info = await transport.sendMail({
        from: `"${fromName}" <${orgConfig.fromEmail}>`,
        to: params.to,
        subject: params.subject,
        html: params.html,
        replyTo: params.replyTo,
      });
      return { ok: true, providerMessageId: info.messageId };
    } catch (err) {
      console.warn(
        "[email] org's own SMTP failed, falling back to platform sender:",
        err instanceof Error ? err.message : err
      );
      // Deliberately fall through to the platform sender below rather
      // than returning an error — a client's misconfigured email
      // credentials should never be the reason a lead never hears back.
    }
  }

  const env = getEnv();

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
 * Always goes through the platform's Resend account regardless of a
 * client's own email config — inbound receiving isn't subject to the
 * outbound sending-domain restriction, and a client's own mailbox isn't
 * wired for inbound routing here anyway (that's what their dedicated
 * SpeedLead inbound address, RESEND_INBOUND_DOMAIN, is for).
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
