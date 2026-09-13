"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnv } from "@/lib/env";

/**
 * Creates a client workspace and invites its first (owner) user, in one
 * step — this replaces public self-serve signup as the only way a new
 * org gets created. Everything runs through the service-role admin
 * client since there is no browser session for the invited user yet.
 */
export async function createClientOrg(_prevState: unknown, formData: FormData) {
  await requirePlatformAdmin(); // defense in depth — actions are directly callable

  const businessName = String(formData.get("business_name") ?? "").trim();
  const businessType = String(formData.get("business_type") ?? "").trim() || null;
  const ownerEmail = String(formData.get("owner_email") ?? "").trim().toLowerCase();
  const ownerName = String(formData.get("owner_name") ?? "").trim() || null;
  const plan = String(formData.get("plan") ?? "demo").trim();

  if (!businessName) return { error: "Business name is required." };
  if (!ownerEmail) return { error: "Owner email is required." };

  const admin = createAdminClient();
  const env = getEnv();

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({
      name: businessName,
      slug: slugify(businessName),
      business_type: businessType,
      alert_email: ownerEmail,
      plan,
      subscription_status: "active",
      trial_ends_at: null,
    })
    .select()
    .single();

  if (orgError || !org) {
    return { error: orgError?.message ?? "Could not create the workspace." };
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    ownerEmail,
    {
      data: { full_name: ownerName },
      redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/confirm?next=/reset-password`,
    }
  );

  if (inviteError || !invited?.user) {
    // The org row exists but is orphaned without a member — clean it up
    // rather than leaving a dangling workspace nobody can access.
    await admin.from("organizations").delete().eq("id", org.id);
    return {
      error:
        inviteError?.message ??
        "Could not invite that email — if they already have a SpeedLead account, add them to the org manually instead.",
    };
  }

  await admin.from("organization_members").insert({
    org_id: org.id,
    user_id: invited.user.id,
    role: "owner",
  });

  await admin.from("lead_sources").insert([
    { org_id: org.id, type: "webhook", name: "General webhook" },
    { org_id: org.id, type: "email", name: "Email" },
  ]);

  revalidatePath("/admin");
  return { message: `Invited ${ownerEmail} to "${businessName}" — they'll get an email to set a password.` };
}

/** Changes an existing org's plan and/or access status. */
export async function updateClientOrg(_prevState: unknown, formData: FormData) {
  await requirePlatformAdmin();

  const orgId = String(formData.get("org_id") ?? "");
  const plan = String(formData.get("plan") ?? "");
  const subscriptionStatus = String(formData.get("subscription_status") ?? "");

  if (!orgId) return { error: "Missing org." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ plan, subscription_status: subscriptionStatus })
    .eq("id", orgId);

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { message: "Updated." };
}

function slugify(input: string) {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base || "business"}-${Math.random().toString(36).slice(2, 7)}`;
}
