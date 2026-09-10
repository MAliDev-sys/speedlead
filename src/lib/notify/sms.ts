import "server-only";
import Twilio from "twilio";
import { getEnv, hasTwilio } from "@/lib/env";

export interface SendSmsResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

let client: ReturnType<typeof Twilio> | null = null;

function getTwilioClient() {
  const env = getEnv();
  if (!hasTwilio(env)) return null;
  if (!client) client = Twilio(env.TWILIO_ACCOUNT_SID!, env.TWILIO_AUTH_TOKEN!);
  return client;
}

/**
 * Sends an SMS from the given org-owned Twilio number. If Twilio isn't
 * configured yet (no keys), this logs instead of throwing so the rest of
 * the app (dashboard, other channels) keeps working during development.
 */
export async function sendSms(params: {
  from: string;
  to: string;
  body: string;
}): Promise<SendSmsResult> {
  const twilio = getTwilioClient();
  if (!twilio) {
    console.warn("[sms] Twilio not configured — skipping send.", params);
    return { ok: false, error: "twilio_not_configured" };
  }

  try {
    const message = await twilio.messages.create({
      from: params.from,
      to: params.to,
      body: params.body,
    });
    return { ok: true, providerMessageId: message.sid };
  } catch (err) {
    const error = err instanceof Error ? err.message : "unknown_error";
    console.error("[sms] send failed", error);
    return { ok: false, error };
  }
}

/** Verifies an inbound Twilio webhook's X-Twilio-Signature header. */
export function verifyTwilioSignature(params: {
  signature: string | null;
  url: string;
  body: Record<string, string>;
}): boolean {
  const env = getEnv();
  if (!env.TWILIO_AUTH_TOKEN || !params.signature) return false;
  return Twilio.validateRequest(
    env.TWILIO_AUTH_TOKEN,
    params.signature,
    params.url,
    params.body
  );
}
