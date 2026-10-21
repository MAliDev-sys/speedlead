import { requireCurrentOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { BusinessProfileForm } from "@/components/settings/business-profile-form";

export const dynamic = "force-dynamic";

export default async function BusinessProfilePage() {
  const { org, role, userId } = await requireCurrentOrg();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone")
    .eq("id", userId)
    .maybeSingle();

  return (
    <DashboardShell org={org} userId={userId}>
      <div className="space-y-6">
        <section>
          <h1 className="text-xl font-bold text-slate-900">Business profile</h1>
          <p className="mt-1 text-sm text-slate-500">
            Your business name, logo and contact details, and your own account details.
          </p>
        </section>

        <BusinessProfileForm
          org={org}
          canEditOrg={role === "owner" || role === "admin"}
          fullName={profile?.full_name ?? null}
          phone={profile?.phone ?? null}
        />
      </div>
    </DashboardShell>
  );
}
