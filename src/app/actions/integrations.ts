"use server";

import { revalidatePath } from "next/cache";
import Twilio from "twilio";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrg } from "@/lib/org";
import { getEnv, hasTwilio } from "@/lib/env";
import type { LeadSourceType } from "@/lib/types/database";

/** Saves (upserts) a tenant's Slack Incoming Webhook URL for lead alerts. */
export async function saveSlackWebhook(_prevState: unknown, formData: FormData) {
  const { org } = await requireCurrentOrg();
  const webhookUrl = String(formData.get("webhook_url") ?? "").trim();

  if (webhookUrl && !webhookUrl.startsWith("https://hooks.slack.com/")) {
    return { error: "That doesn't look like a Slack Incoming Webhook URL." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("integrations").upsert(
    {
      org_id: org.id,
      type: "slack",
      config: { webhook_url: webhookUrl },
      status: webhookUrl ? "connected" : "disconnected",
    },
    { onConflict: "org_id,type" }
  );
  if (error) return { error: error.message };

  revalidatePath("/settings/integrations");
  return { message: webhookUrl ? "Slack connected." : "Slack disconnected." };
}

/** Creates an additional lead source (webhook or embeddable form) for the org. */
export async function createLeadSource(_prevState: unknown, formData: FormData) {
  const { org } = await requireCurrentOrg();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "webhook") as LeadSourceType;

  if (!name) return { error: "Name is required." };
  if (!["webhook", "form"].includes(type)) return { error: "Invalid source type." };

  const supabase = await createClient();
  const { error } = await supabase.from("lead_sources").insert({ org_id: org.id, name, type });
  if (error) return { error: error.message };

  revalidatePath("/settings/integrations");
  return { message: "Lead source created." };
}

/** Updates the real business phone that missed calls should ring/forward to. */
export async function updateForwardingNumber(_prevState: unknown, formData: FormData) {
  const { org } = await requireCurrentOrg();
  const forwardingNumber = String(formData.get("forwarding_number") ?? "").trim();
  if (!forwardingNumber) return { error: "Enter the phone number to forward calls to." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("phone_numbers")
    .update({ forwarding_number: forwardingNumber })
    .eq("org_id", org.id);
  if (error) return { error: error.message };

  revalidatePath("/settings/integrations");
  return { message: "Forwarding number updated." };
}

/**
 * Self-serve provisioning: buys a local Twilio number on the platform's
 * shared Twilio account and wires its voice/SMS webhooks to this org.
 * Costs real money on the Twilio bill (~$1.15/mo) the moment this succeeds,
 * so it's a deliberate button click, not something that runs automatically.
 */
export async function provisionPhoneNumber(_prevState: unknown, formData: FormData) {
  const { org } = await requireCurrentOrg();
  const env = getEnv();
  if (!hasTwilio(env)) {
    return { error: "Twilio isn't configured on this deployment yet (see docs/SETUP.md)." };
  }

  const forwardingNumber = String(formData.get("forwarding_number") ?? "").trim();
  const areaCode = String(formData.get("area_code") ?? "").trim();
  if (!forwardingNumber) return { error: "Enter the phone number to forward calls to first." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("phone_numbers")
    .select("id")
    .eq("org_id", org.id)
    .maybeSingle();
  if (existing) return { error: "This business already has a SpeedLead number." };

  const client = Twilio(env.TWILIO_ACCOUNT_SID!, env.TWILIO_AUTH_TOKEN!);

  try {
    const candidates = await client.availablePhoneNumbers("US").local.list({
      areaCode: areaCode ? Number(areaCode) : undefined,
      smsEnabled: true,
      voiceEnabled: true,
      limit: 1,
    });
    if (candidates.length === 0) {
      return { error: "No numbers available for that area code — try a different one." };
    }

    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber: candidates[0].phoneNumber,
      voiceUrl: `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/voice`,
      voiceMethod: "POST",
      smsUrl: `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/sms`,
      smsMethod: "POST",
    });

    const { error } = await supabase.from("phone_numbers").insert({
      org_id: org.id,
      twilio_sid: purchased.sid,
      phone_number: purchased.phoneNumber,
      forwarding_number: forwardingNumber,
    });
    if (error) return { error: error.message };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Twilio request failed.";
    return { error: message };
  }

  revalidatePath("/settings/integrations");
  return { message: "Number provisioned! Missed calls will now text back automatically." };
}
