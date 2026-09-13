import { requireCurrentOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { SequenceEditor } from "@/components/settings/sequence-editor";
import type { SequenceStep } from "@/app/actions/sequences";

export const dynamic = "force-dynamic";

const DEFAULT_STEPS: SequenceStep[] = [
  {
    delay_minutes: 15,
    channel: "sms",
    template: "Hi {{name}}, just checking in — still interested in getting a quote from {{org_name}}? Reply here anytime.",
  },
  {
    delay_minutes: 1440,
    channel: "sms",
    template: "Hi {{name}}, following up from {{org_name}} — happy to answer any questions or get you scheduled.",
  },
];

export default async function SequencesPage() {
  const { org, userId } = await requireCurrentOrg();
  const supabase = await createClient();

  const { data: sequence } = await supabase
    .from("sequences")
    .select("*")
    .eq("org_id", org.id)
    .limit(1)
    .maybeSingle();

  const steps = (sequence?.steps as SequenceStep[] | undefined) ?? DEFAULT_STEPS;

  return (
    <DashboardShell org={org} userId={userId}>
      <h1 className="text-xl font-semibold text-slate-900">Follow-up sequence</h1>
      <p className="mt-1 text-sm text-slate-500">
        If a lead doesn&apos;t reply, automatically nudge them again. Cancelled the moment they
        respond or the lead is marked won/lost. Use <code className="rounded bg-slate-100 px-1">{"{{name}}"}</code>{" "}
        and <code className="rounded bg-slate-100 px-1">{"{{org_name}}"}</code> as placeholders.
      </p>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <SequenceEditor initialSteps={steps} isActive={sequence?.is_active ?? false} />
      </div>
    </DashboardShell>
  );
}
