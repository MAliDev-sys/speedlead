import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole, Organization } from "@/lib/types/database";

/**
 * Resolves the signed-in user's organization for the dashboard.
 *
 * MVP simplification: one org per user (the common case for a small HVAC/
 * plumbing business owner). If they belong to more than one, this picks the
 * first by join date; a proper org switcher can pick a `?org=` override
 * later without changing this contract.
 */
export async function requireCurrentOrg(): Promise<{
  org: Organization;
  role: MemberRole;
  userId: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Two queries instead of an embedded `organizations(*)` select: our
  // Database type doesn't populate `Relationships` (see the note in
  // lib/types/database.ts), so postgrest-js can't type-check embedded
  // resource joins here. Plain queries keep this simple and fully typed.
  const { data: membership } = await supabase
    .from("organization_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) {
    redirect("/onboarding");
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", membership.org_id)
    .maybeSingle();

  if (!org) {
    redirect("/onboarding");
  }

  if (org.subscription_status === "suspended") {
    redirect("/suspended");
  }
  if (isTrialExpired(org)) {
    redirect("/suspended?reason=trial_expired");
  }

  return {
    org,
    role: membership.role,
    userId: user.id,
  };
}

function isTrialExpired(org: Pick<Organization, "subscription_status" | "trial_ends_at">): boolean {
  return (
    org.subscription_status === "trialing" &&
    org.trial_ends_at != null &&
    new Date(org.trial_ends_at) < new Date()
  );
}

/**
 * True once a trial org should stop getting any real work done on its
 * behalf — not just locked out of the dashboard (requireCurrentOrg,
 * above) but out of the actual product too. Without this, an org past
 * its trial (or explicitly suspended) could still have its inbound leads
 * auto-answered by AI, alerted to Slack, and drip-followed-up forever —
 * the dashboard lock doesn't touch any of that, since leads arrive via
 * webhooks/cron with no signed-in session to gate. Shared by the lead
 * intake pipeline (lib/leads.ts), the reply-handling webhooks, and the
 * follow-up cron worker so none of them keep working for an org nobody's
 * paying for. New leads still get recorded either way — just without
 * the auto-response — so nothing is lost once the org is upgraded.
 */
export function isOrgLocked(org: Pick<Organization, "subscription_status" | "trial_ends_at">): boolean {
  return org.subscription_status === "suspended" || isTrialExpired(org);
}
