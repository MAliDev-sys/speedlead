import "server-only";
import { Resend } from "resend";
import { getEnv, hasResend } from "@/lib/env";

export interface SendEmailResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

let client: Resend | null = null;

function getResendClient() {
  const env = getEnv();
  if (!hasResend(env)) return null;
  if (!client) client = new Resend(env.RESEND_API_KEY!);
  return client;
}

/**
 * Sends an email from the platform's shared Resend domain on behalf of a
 * tenant, with the tenant's own business email set as reply-to so replies
 * go straight to them.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<SendEmailResult> {
  const env = getEnv();
  const resend = getResendClient();
  if (!resend) {
    console.warn("[email] Resend not configured — skipping send.", params);
    return { ok: false, error: "resend_not_configured" };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL!,
      to: params.to,
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, providerMessageId: data?.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : "unknown_error";
    console.error("[email] send failed", error);
    return { ok: false, error };
  }
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
