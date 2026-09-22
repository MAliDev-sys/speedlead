"use server";

import { revalidatePath } from "next/cache";
import Twilio from "twilio";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrg } from "@/lib/org";
import { getEnv, hasTwilio } from "@/lib/env";
import type { AutoRespondMode, LeadSourceType } from "@/lib/types/database";

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

/**
 * Saves (upserts) a tenant's own outbound email credentials, so replies to
 * their leads come from their real business address/domain instead of the
 * platform's shared Gmail/Resend sender — see lib/notify/email.ts for the
 * fallback chain that uses this. Optional: leaving it unset just keeps the
 * platform sender, which is the default for every org today.
 */
export async function saveEmailIntegration(_prevState: unknown, formData: FormData) {
  const { org } = await requireCurrentOrg();
  const fromEmail = String(formData.get("from_email") ?? "").trim();
  const smtpHost = String(formData.get("smtp_host") ?? "").trim();
  const smtpPort = String(formData.get("smtp_port") ?? "587").trim();
  const smtpUser = String(formData.get("smtp_user") ?? "").trim();
  const smtpPass = String(formData.get("smtp_pass") ?? "").trim();

  const supabase = await createClient();

  // Blank form = disconnect, so a client can revert to the platform
  // sender without having to remember or re-enter their credentials.
  if (!fromEmail && !smtpHost && !smtpUser && !smtpPass) {
    const { error } = await supabase.from("integrations").upsert(
      { org_id: org.id, type: "email", config: {}, status: "disconnected" },
      { onConflict: "org_id,type" }
    );
    if (error) return { error: error.message };
    revalidatePath("/settings/integrations");
    return { message: "Custom email sender disconnected — back to the platform default." };
  }

  if (!fromEmail || !smtpHost || !smtpUser || !smtpPass) {
    return { error: "From email, SMTP host, username, and password are all required." };
  }
  const port = Number(smtpPort);
  if (!Number.isFinite(port) || port <= 0) {
    return { error: "SMTP port must be a number (e.g. 587 or 465)." };
  }

  // A saved password never round-trips back into the client-rendered
  // form (see EmailSendingForm below), so a masked placeholder submitted
  // unchanged means "keep the existing password" rather than overwriting
  // it with the literal mask.
  let passToStore = smtpPass;
  if (smtpPass === "••••••••") {
    const { data: existing } = await supabase
      .from("integrations")
      .select("config")
      .eq("org_id", org.id)
      .eq("type", "email")
      .maybeSingle();
    const existingConfig =
      existing?.config && typeof existing.config === "object"
        ? (existing.config as Record<string, unknown>)
        : null;
    if (!existingConfig?.smtp_pass) {
      return { error: "Enter the SMTP password." };
    }
    passToStore = String(existingConfig.smtp_pass);
  }

  const { error } = await supabase.from("integrations").upsert(
    {
      org_id: org.id,
      type: "email",
      config: {
        from_email: fromEmail,
        smtp_host: smtpHost,
        smtp_port: port,
        smtp_user: smtpUser,
        smtp_pass: passToStore,
      },
      status: "connected",
    },
    { onConflict: "org_id,type" }
  );
  if (error) return { error: error.message };

  revalidatePath("/settings/integrations");
  return { message: "Custom email sender connected — replies will now come from this address." };
}

/**
 * Saves how the instant reply should handle the customer's actual message:
 * a fixed acknowledgment ('template') or a short Claude-generated reply
 * grounded in `ai_context` ('ai', with automatic fallback to the template
 * on any failure — see lib/ai-respond.ts).
 */
export async function saveAutoResponse(_prevState: unknown, formData: FormData) {
  const { org } = await requireCurrentOrg();
  const mode = String(formData.get("mode") ?? "template") as AutoRespondMode;
  const aiContext = String(formData.get("ai_context") ?? "").trim();

  if (!["template", "ai"].includes(mode)) {
    return { error: "Invalid mode." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ auto_respond_mode: mode, ai_context: aiContext || null })
    .eq("id", org.id);
  if (error) return { error: error.message };

  revalidatePath("/settings/integrations");
  return { message: "Auto-response settings saved." };
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

/**
 * Attaches a number this business already owns on the platform's Twilio
 * account (bought directly through Twilio, not via provisionPhoneNumber
 * above) — points its voice/SMS webhooks at this app and records it, no
 * new purchase or charge. The number must already live under the same
 * Twilio account as TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN; a number bought
 * under a different Twilio account isn't visible to this call and needs
 * to be moved into this account (or its subaccount) first.
 */
export async function connectExistingPhoneNumber(_prevState: unknown, formData: FormData) {
  const { org } = await requireCurrentOrg();
  const env = getEnv();
  if (!hasTwilio(env)) {
    return { error: "Twilio isn't configured on this deployment yet (see docs/SETUP.md)." };
  }

  const phoneNumber = String(formData.get("phone_number") ?? "").trim();
  const forwardingNumber = String(formData.get("forwarding_number") ?? "").trim();
  if (!phoneNumber) return { error: "Enter the number you already own, e.g. +15551234567." };
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
    const matches = await client.incomingPhoneNumbers.list({ phoneNumber, limit: 1 });
    if (matches.length === 0) {
      return {
        error:
          "That number isn't in this Twilio account. Double-check it's E.164 format (+1…) and bought under the Twilio account connected to this app.",
      };
    }

    const found = matches[0];
    await client.incomingPhoneNumbers(found.sid).update({
      voiceUrl: `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/voice`,
      voiceMethod: "POST",
      smsUrl: `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/sms`,
      smsMethod: "POST",
    });

    const { error } = await supabase.from("phone_numbers").insert({
      org_id: org.id,
      twilio_sid: found.sid,
      phone_number: found.phoneNumber,
      forwarding_number: forwardingNumber,
    });
    if (error) return { error: error.message };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Twilio request failed.";
    return { error: message };
  }

  revalidatePath("/settings/integrations");
  return { message: "Number connected! Missed calls will now text back automatically." };
}
