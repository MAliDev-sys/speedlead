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

  return {
    org,
    role: membership.role,
    userId: user.id,
  };
}
