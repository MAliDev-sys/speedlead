"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Creates the caller's organization + owner membership + a starter webhook
 * lead source, all via the admin client (server-only, bypasses RLS) after
 * verifying identity through the session-bound SSR client. Intentionally
 * NOT exposed as a client-insertable RLS policy: letting a browser session
 * insert its own `organization_members` row with an arbitrary org_id would
 * let anyone join (and read leads for) any tenant.
 */
export async function createOrganization(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const businessType = String(formData.get("business_type") ?? "").trim() || null;
  const alertEmail = String(formData.get("alert_email") ?? "").trim() || user.email || null;

  if (!name) return { error: "Business name is required." };

  const slug = slugify(name);
  const admin = createAdminClient();

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name, slug, business_type: businessType, alert_email: alertEmail })
    .select()
    .single();

  if (orgError || !org) {
    return { error: orgError?.message ?? "Could not create organization." };
  }

  const { error: memberError } = await admin
    .from("organization_members")
    .insert({ org_id: org.id, user_id: user.id, role: "owner" });

  if (memberError) {
    return { error: memberError.message };
  }

  // Default lead sources so the org has something usable immediately:
  // a generic webhook to point Zapier/LSA/Facebook at, and a dedicated
  // inbound email address (see api/webhooks/resend/route.ts) so a
  // customer emailing the business directly also becomes a lead.
  await admin.from("lead_sources").insert([
    { org_id: org.id, type: "webhook", name: "General webhook" },
    { org_id: org.id, type: "email", name: "Email" },
  ]);

  redirect("/leads");
}

function slugify(input: string) {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base || "business"}-${Math.random().toString(36).slice(2, 7)}`;
}
