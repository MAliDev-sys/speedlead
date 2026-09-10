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
