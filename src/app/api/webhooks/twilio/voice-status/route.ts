import Twilio from "twilio";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTwilioSignature } from "@/lib/notify/sms";
import { createLeadAndNotify, findOrCreateMissedCallSource } from "@/lib/leads";

export const dynamic = "force-dynamic";

const MISSED_STATUSES = new Set(["no-answer", "busy", "failed", "canceled"]);

/**
 * `action` callback for the <Dial> in /api/webhooks/twilio/voice. Twilio
 * posts here once the dial attempt to the business's phone finishes. If it
 * wasn't answered, this is the missed-call → instant-text-back moment: we
 * create a lead from the caller ID and immediately text them back, then
 * politely tell the (still-connected) caller the same thing before hanging
 * up.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const form = new URLSearchParams(rawBody);
  const formObj = Object.fromEntries(form.entries());

  const signature = request.headers.get("x-twilio-signature");
  if (!verifyTwilioSignature({ signature, url: request.url, body: formObj })) {
    return new Response("Invalid signature", { status: 403 });
  }

  const dialStatus = formObj.DialCallStatus;
  const calledNumber = formObj.To; // the org's SpeedLead number
  const callerNumber = formObj.From;

  const twiml = new Twilio.twiml.VoiceResponse();

  if (MISSED_STATUSES.has(dialStatus) && callerNumber) {
    try {
      const admin = createAdminClient();
      const { data: phoneRow } = await admin
        .from("phone_numbers")
        .select("org_id")
        .eq("phone_number", calledNumber)
        .maybeSingle();

      if (phoneRow) {
        const { data: org } = await admin
          .from("organizations")
          .select("*")
          .eq("id", phoneRow.org_id)
          .maybeSingle();

        if (org) {
          const source = await findOrCreateMissedCallSource(org.id);
          await createLeadAndNotify(source, org, {
            phone: callerNumber,
            message: `Missed call (${dialStatus})`,
            raw_payload: formObj as never,
          });
        }
      }
    } catch (err) {
      console.error("[voice-status] failed to create missed-call lead", err);
    }

    twiml.say(
      "Sorry we missed your call. We're texting you right now and someone will follow up shortly."
    );
  }

  twiml.hangup();
  return new Response(twiml.toString(), {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
