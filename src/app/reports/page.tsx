import { requireCurrentOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { ReportView } from "@/components/reports/report-view";
import { buildReport, resolvePeriod } from "@/lib/reports";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const { org, userId } = await requireCurrentOrg();
  const supabase = await createClient();
  const period = resolvePeriod(params, org.timezone);
  const report = await buildReport(supabase, org.id, period);

  return (
    <DashboardShell org={org} userId={userId}>
      <ReportView period={period} report={report} />
    </DashboardShell>
  );
}
