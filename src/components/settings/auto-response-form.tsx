"use client";

import { useActionState, useState } from "react";
import { saveAutoResponse } from "@/app/actions/integrations";
import type { AutoRespondMode } from "@/lib/types/database";

export function AutoResponseForm({
  mode,
  aiContext,
}: {
  mode: AutoRespondMode;
  aiContext: string | null;
}) {
  const [state, formAction, pending] = useActionState(saveAutoResponse, undefined);
  const [selectedMode, setSelectedMode] = useState<AutoRespondMode>(mode);

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-xs text-slate-500">
        Controls the instant reply sent when a lead comes in (and, in AI mode, replies to
        follow-up texts too) — not whether it sends at all, just whether it&apos;s a fixed
        message or one that actually addresses what the customer wrote. Either way, something
        goes out within seconds.
      </p>

      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="mode"
            value="template"
            checked={selectedMode === "template"}
            onChange={() => setSelectedMode("template")}
          />
          Fixed message (free)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="mode"
            value="ai"
            checked={selectedMode === "ai"}
            onChange={() => setSelectedMode("ai")}
          />
          AI-generated reply (Claude Haiku — a fraction of a cent per reply)
        </label>
      </div>

      {selectedMode === "ai" ? (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Business info for the AI (services, hours, service area, pricing notes)
          </span>
          <textarea
            name="ai_context"
            defaultValue={aiContext ?? ""}
            rows={4}
            placeholder="e.g. We install and repair residential HVAC systems in the Austin metro area. Office hours Mon-Fri 8am-6pm, emergency service available 24/7. Free estimates on new installs."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-slate-400">
            The AI only uses what you write here — it won&apos;t invent prices or availability,
            and it always tells the customer a real team member will follow up too.
          </span>
        </label>
      ) : null}

      {state && "error" in state && state.error ? (
        <p className="text-sm text-red-600">{state.error}</p>
      ) : null}
      {state && "message" in state && state.message ? (
        <p className="text-sm text-emerald-600">{state.message}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
