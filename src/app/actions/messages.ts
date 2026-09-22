"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendSms } from "@/lib/notify/sms";
import { sendEmail } from "@/lib/notify/email";

/**
 * Sends a one-off manual reply (SMS or email) to a lead from the
 * dashboard — the gap where AI/template auto-response is off (or a
 * follow-up question needs a real human answer) and there was otherwise
 * no way to respond to a lead without leaving the app. Uses the
 * session-bound (RLS-scoped) client throughout, so this can only ever
 * touch a lead belonging to an org the caller is a member of.
 */
export async function sendManualReply(_prevState: unknown, formData: FormData) {
  const leadId = String(formData.get("lead_id") ?? "");
  const channel = String(formData.get("channel") ?? "sms") as "sms" | "email";
  const body = String(formData.get("body") ?? "").trim();

  if (!leadId) return { error: "Missing lead." };
  if (!body) return { error: "Message can't be empty." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: lead } = await supabase
    .from("leads")
    .select("id, org_id, phone, email")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { error: "Lead not found." };

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, alert_email")
    .eq("id", lead.org_id)
    .maybeSingle();
  if (!org) return { error: "Organization not found." };

  let ok = false;
  let sendError: string | undefined;
  let providerMessageId: string | undefined;
  let fromAddress: string | null = null;
  let toAddress: string | null = null;

  if (channel === "sms") {
    if (!lead.phone) return { error: "This lead has no phone number." };

    const { data: phoneRow } = await supabase
      .from("phone_numbers")
      .select("phone_number")
      .eq("org_id", org.id)
      .limit(1)
      .maybeSingle();
    if (!phoneRow) {
      return { error: "No SpeedLead number set up yet — see Settings → Integrations." };
    }

    const res = await sendSms({ from: phoneRow.phone_number, to: lead.phone, body });
    ok = res.ok;
    sendError = res.error;
    providerMessageId = res.providerMessageId;
    fromAddress = phoneRow.phone_number;
    toAddress = lead.phone;
  } else {
    if (!lead.email) return { error: "This lead has no email address." };

    const res = await sendEmail({
      orgId: org.id,
      to: lead.email,
      subject: `Re: your request to ${org.name}`,
      html: `<p>${escapeHtml(body).replace(/\n/g, "<br/>")}</p>`,
      replyTo: org.alert_email ?? undefined,
      fromName: org.name,
    });
    ok = res.ok;
    sendError = res.error;
    providerMessageId = res.providerMessageId;
    toAddress = lead.email;
  }

  await supabase.from("messages").insert({
    org_id: org.id,
    lead_id: lead.id,
    channel,
    direction: "outbound",
    to_address: toAddress,
    from_address: fromAddress,
    body,
    provider_message_id: providerMessageId ?? null,
    status: ok ? "sent" : "failed",
    error: sendError ?? null,
  });

  await supabase.from("lead_events").insert({
    org_id: org.id,
    lead_id: lead.id,
    type: `${channel}_sent`,
    payload: { ok, error: sendError ?? null, manual: true, by: user.id },
  });

  if (!ok) return { error: sendError ?? "Failed to send — check Settings → Integrations." };

  revalidatePath(`/leads/${leadId}`);
  return { message: "Sent." };
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
