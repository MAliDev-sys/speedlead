import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTwilioSignature } from "@/lib/notify/sms";
import { sendSlackLeadAlert } from "@/lib/notify/slack";
import { generateAiReply, fallbackFollowUpReply } from "@/lib/ai-respond";
import { getConversationHistory } from "@/lib/conversation";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Inbound SMS webhook: POST /api/webhooks/twilio/sms
 *
 * Configure as the "A message comes in" webhook on each org's Twilio
 * number. Logs the reply, marks the most recent matching lead as
 * `responded` (which cancels any pending drip-sequence jobs — see the
 * `cancel_pending_jobs_on_response` trigger), and pings the team's Slack so
 * a human picks up the conversation.
 *
 * Every reply gets an actual response — synchronously, within this same
 * webhook response (TwiML `<Message>`), so it goes out in seconds,
 * comfortably inside Twilio's ~15s webhook timeout and the product's
 * 30-60s reply SLA. When AI mode is on, that's a conversation-aware
 * answer; either way (AI off, or the AI call fails) it falls back to a
 * plain acknowledgment rather than silently sending nothing — same
 * guarantee the first-touch flow already has.
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

  let replyText: string | null = null;

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
      // Fetch history before logging this inbound message, so the AI
      // reply below sees "everything said before this" separately from
      // "the new message" rather than double-counting it.
      const history = await getConversationHistory(lead.id);

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

      if (org && body.trim()) {
        const aiReply =
          org.auto_respond_mode === "ai"
            ? await generateAiReply({
                businessName: org.name,
                businessType: org.business_type,
                aiContext: org.ai_context,
                history,
                customerMessage: body,
                channel: "sms",
              })
            : null;
        replyText = aiReply ?? fallbackFollowUpReply(org.name);

        await admin.from("messages").insert({
          org_id: lead.org_id,
          lead_id: lead.id,
          channel: "sms",
          direction: "outbound",
          from_address: to,
          to_address: from,
          body: replyText,
          status: "sent",
        });
        await admin.from("lead_events").insert({
          org_id: lead.org_id,
          lead_id: lead.id,
          type: "sms_sent",
          payload: { ok: true, ai: Boolean(aiReply) },
        });
      }
    }
  }

  const twiml = replyText
    ? `<Response><Message>${escapeXml(replyText)}</Message></Response>`
    : "<Response></Response>";

  return new Response(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function escapeXml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
