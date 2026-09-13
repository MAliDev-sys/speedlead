import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Gates the platform-admin area (app/admin/*). Not a per-org role — this
 * checks the platform-wide `platform_admins` table via the service-role
 * client (that table has no RLS policies at all, so only this
 * server-side check can ever read it — see 0004_platform_admin.sql).
 */
export async function requirePlatformAdmin(): Promise<{ userId: string; email: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await isPlatformAdmin(user.id))) redirect("/leads");

  return { userId: user.id, email: user.email ?? null };
}

/** Cheap boolean check for conditionally showing the "Admin" nav link. */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}
