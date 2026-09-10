"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrg } from "@/lib/org";

// `type`, not `interface` — see the note in lib/types/database.ts on why
// interfaces don't satisfy the Json/index-signature checks used for jsonb
// columns (here, `sequences.steps`).
export type SequenceStep = {
  delay_minutes: number;
  channel: "sms" | "email" | "whatsapp";
  template: string;
};

/**
 * MVP simplification: one active follow-up sequence per org (not many named
 * sequences with branching logic). Replaces its steps wholesale.
 */
export async function saveSequence(steps: SequenceStep[]) {
  const { org } = await requireCurrentOrg();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("sequences")
    .select("id")
    .eq("org_id", org.id)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("sequences")
      .update({ steps, is_active: true })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("sequences")
      .insert({ org_id: org.id, name: "Default follow-up", steps, is_active: true });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/settings/sequences");
}
