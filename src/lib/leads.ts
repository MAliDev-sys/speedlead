import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewLead } from "@/lib/notify";
import type { Json, LeadSource, Organization } from "@/lib/types/database";

export interface IncomingLeadFields {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  message?: string | null;
  raw_payload?: Json;
}

/** Looks up an active lead source (and its parent org) by its public token. */
export async function getLeadSourceByToken(
  token: string
): Promise<{ source: LeadSource; org: Organization } | null> {
  const admin = createAdminClient();
  const { data: source } = await admin
    .from("lead_sources")
    .select("*")
    .eq("public_token", token)
    .eq("is_active", true)
    .maybeSingle();

  if (!source) return null;

  const { data: org } = await admin
    .from("organizations")
    .select("*")
    .eq("id", source.org_id)
    .maybeSingle();

  if (!org) return null;
  return { source, org };
}

/**
 * Inserts a lead row for the given source, records the "created" event, and
 * fires the instant multi-channel response synchronously. This is the
 * single entry point every intake path (webhook, embeddable form, missed
 * call) should call, so the speed-to-lead behavior is consistent everywhere.
 */
export async function createLeadAndNotify(
  source: LeadSource,
  org: Organization,
  fields: IncomingLeadFields
) {
  const admin = createAdminClient();

  if (!fields.phone && !fields.email) {
    throw new LeadValidationError("A lead needs at least a phone number or an email.");
  }

  const { data: lead, error } = await admin
    .from("leads")
    .insert({
      org_id: org.id,
      source_id: source.id,
      name: fields.name ?? null,
      phone: fields.phone ?? null,
      email: fields.email ?? null,
      message: fields.message ?? null,
      raw_payload: fields.raw_payload ?? {},
      status: "new",
    })
    .select()
    .single();

  if (error || !lead) {
    throw new Error(`Failed to create lead: ${error?.message ?? "unknown error"}`);
  }

  await admin.from("lead_events").insert({
    org_id: org.id,
    lead_id: lead.id,
    type: "created",
    payload: { source_type: source.type, source_name: source.name },
  });

  const notifyChannels =
    source.config &&
    typeof source.config === "object" &&
    Array.isArray((source.config as Record<string, unknown>).notify_channels)
      ? ((source.config as Record<string, unknown>).notify_channels as string[])
      : undefined;

  // Best-effort: a notification failure should never fail the intake
  // request itself (the lead is already saved either way).
  try {
    await notifyNewLead({ lead, org, sourceName: source.name, channels: notifyChannels });
  } catch (err) {
    console.error("[leads] notifyNewLead failed", err);
  }

  return lead;
}

export class LeadValidationError extends Error {}

/**
 * Every org needs exactly one 'missed_call' lead_source to attribute
 * missed-call-text-back leads to. Created lazily the first time a call to
 * that org's number goes unanswered, rather than requiring a manual
 * onboarding step.
 */
export async function findOrCreateMissedCallSource(orgId: string): Promise<LeadSource> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("lead_sources")
    .select("*")
    .eq("org_id", orgId)
    .eq("type", "missed_call")
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await admin
    .from("lead_sources")
    .insert({ org_id: orgId, type: "missed_call", name: "Missed Call" })
    .select()
    .single();

  if (error || !created) {
    throw new Error(`Failed to create missed_call lead source: ${error?.message}`);
  }
  return created;
}
