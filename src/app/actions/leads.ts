"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { LeadStatus } from "@/lib/types/database";

const VALID_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "responded",
  "qualified",
  "won",
  "lost",
  "spam",
];

/**
 * Updates a lead's status. Uses the session-bound (RLS-scoped) client, so
 * this can only ever touch a lead belonging to an org the caller is a
 * member of — no admin client needed here.
 */
export async function updateLeadStatus(leadId: string, status: string) {
  if (!VALID_STATUSES.includes(status as LeadStatus)) {
    throw new Error(`Invalid status: ${status}`);
  }
  const nextStatus = status as LeadStatus;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");

  const { data: lead, error } = await supabase
    .from("leads")
    .update({ status: nextStatus })
    .eq("id", leadId)
    .select("org_id")
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("lead_events").insert({
    org_id: lead.org_id,
    lead_id: leadId,
    type: "status_changed",
    payload: { status, by: user.id },
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
}

/** Assigns a lead to the current user ("Claim"). */
export async function claimLead(leadId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");

  const { error } = await supabase
    .from("leads")
    .update({ assigned_to: user.id, status: "contacted" })
    .eq("id", leadId);
  if (error) throw new Error(error.message);

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
}
