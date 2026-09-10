import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTwilioSignature } from "@/lib/notify/sms";
import { sendSlackLeadAlert } from "@/lib/notify/slack";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Inbound SMS webhook: POST /api/webhooks/twilio/sms
 *
 * Configure as the "A message comes in" webhook on each org's Twilio
 * number. Logs the reply, marks the most recent matching lead as
 * `responded` (which cancels any pending drip-sequence jobs — see the
 * `cancel_pending_jobs_on_response` trigger), and pings the team's Slack so
 * a human picks up the conversation. Twilio expects an empty/valid TwiML
 * response; we don't auto-reply here to avoid talking over a real person.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const form = new URLSearchParams(rawBody);
  const formObj = Object.fromEntries(form.entries());

  const signature = request.headers.get("x-twilio-signature");
  if (!verifyTwilioSignature({ signature, url: request.url, body: formObj })) {
    return new Response("Invalid signature", { status: 403 });
  }

  const from = formObj.From;
  const to = formObj.To;
  const body = formObj.Body ?? "";

  const admin = createAdminClient();
  const { data: phoneRow } = await admin
    .from("phone_numbers")
    .select("org_id")
    .eq("phone_number", to)
    .maybeSingle();

  if (phoneRow) {
    const { data: lead } = await admin
      .from("leads")
      .select("id, org_id, status")
      .eq("org_id", phoneRow.org_id)
      .eq("phone", from)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lead) {
      await admin.from("messages").insert({
        org_id: lead.org_id,
        lead_id: lead.id,
        channel: "sms",
        direction: "inbound",
        from_address: from,
        to_address: to,
        body,
        status: "received",
      });

      if (lead.status === "new" || lead.status === "contacted") {
        await admin.from("leads").update({ status: "responded" }).eq("id", lead.id);
      }

      const { data: org } = await admin
        .from("organizations")
        .select("*")
        .eq("id", lead.org_id)
        .maybeSingle();
      const { data: integration } = await admin
        .from("integrations")
        .select("config, status")
        .eq("org_id", lead.org_id)
        .eq("type", "slack")
        .maybeSingle();

      const webhookUrl =
        integration?.status === "connected" &&
        integration.config &&
        typeof integration.config === "object" &&
        "webhook_url" in integration.config
          ? String((integration.config as Record<string, unknown>).webhook_url)
          : null;

      if (webhookUrl && org) {
        await sendSlackLeadAlert({
          webhookUrl,
          orgName: org.name,
          leadName: null,
          leadPhone: from,
          leadEmail: null,
          leadMessage: `💬 Reply: "${body}"`,
          source: "SMS reply",
          leadUrl: `${getEnv().NEXT_PUBLIC_APP_URL}/leads/${lead.id}`,
        });
      }
    }
  }

  return new Response("<Response></Response>", {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
