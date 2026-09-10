import Twilio from "twilio";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTwilioSignature } from "@/lib/notify/sms";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Twilio Voice webhook for a business's SpeedLead number:
 * POST /api/webhooks/twilio/voice
 *
 * Configure this as the "A call comes in" webhook on each org's Twilio
 * number. It rings the business's real phone (`phone_numbers.forwarding_number`)
 * for `ring_timeout_seconds`; if unanswered, Twilio calls the `action` URL
 * below (`/voice-status`), which is where the missed-call → instant-text-back
 * flow actually happens.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const form = new URLSearchParams(rawBody);
  const formObj = Object.fromEntries(form.entries());

  const signature = request.headers.get("x-twilio-signature");
  const url = absoluteUrl(request);
  if (!verifyTwilioSignature({ signature, url, body: formObj })) {
    return new Response("Invalid signature", { status: 403 });
  }

  const calledNumber = formObj.To;
  const admin = createAdminClient();
  const { data: phoneRow } = await admin
    .from("phone_numbers")
    .select("org_id, forwarding_number, ring_timeout_seconds")
    .eq("phone_number", calledNumber)
    .maybeSingle();

  const twiml = new Twilio.twiml.VoiceResponse();

  if (!phoneRow?.forwarding_number) {
    twiml.say("Thanks for calling. Nobody is available to take your call right now. Please leave a message after the tone.");
    twiml.record({ maxLength: 120 });
    return xmlResponse(twiml);
  }

  const dial = twiml.dial({
    timeout: phoneRow.ring_timeout_seconds ?? 20,
    callerId: calledNumber,
    action: `${getEnv().NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/voice-status`,
    method: "POST",
  });
  dial.number(phoneRow.forwarding_number);

  return xmlResponse(twiml);
}

function xmlResponse(twiml: InstanceType<typeof Twilio.twiml.VoiceResponse>) {
  return new Response(twiml.toString(), {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function absoluteUrl(request: Request) {
  // Twilio signs the exact URL it called. Behind Vercel's proxy the
  // request.url origin is correct, but if you terminate TLS elsewhere,
  // make sure NEXT_PUBLIC_APP_URL matches what's configured in Twilio.
  return request.url;
}
