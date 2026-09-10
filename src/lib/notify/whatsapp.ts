import "server-only";
import Twilio from "twilio";
import { getEnv, hasTwilio } from "@/lib/env";
import type { SendSmsResult } from "./sms";

let client: ReturnType<typeof Twilio> | null = null;

function getTwilioClient() {
  const env = getEnv();
  if (!hasTwilio(env)) return null;
  if (!client) client = Twilio(env.TWILIO_ACCOUNT_SID!, env.TWILIO_AUTH_TOKEN!);
  return client;
}

/**
 * Sends a WhatsApp message via Twilio's WhatsApp API, using ONE shared
 * platform WhatsApp sender (env.TWILIO_WHATSAPP_FROM) for every tenant —
 * simplest/cheapest setup for MVP. In the Twilio sandbox, the recipient
 * must have opted in by messaging the sandbox number first; in production
 * this requires an approved WhatsApp Sender + message templates for the
 * first outbound message in a 24h window.
 */
export async function sendWhatsApp(params: {
  to: string; // E.164, e.g. "+15551234567" (the "whatsapp:" prefix is added here)
  body: string;
}): Promise<SendSmsResult> {
  const env = getEnv();
  const twilio = getTwilioClient();
  if (!twilio || !env.TWILIO_WHATSAPP_FROM) {
    console.warn("[whatsapp] Twilio WhatsApp not configured — skipping send.", params);
    return { ok: false, error: "whatsapp_not_configured" };
  }

  try {
    const message = await twilio.messages.create({
      from: env.TWILIO_WHATSAPP_FROM,
      to: `whatsapp:${params.to.replace(/^whatsapp:/, "")}`,
      body: params.body,
    });
    return { ok: true, providerMessageId: message.sid };
  } catch (err) {
    const error = err instanceof Error ? err.message : "unknown_error";
    console.error("[whatsapp] send failed", error);
    return { ok: false, error };
  }
}
