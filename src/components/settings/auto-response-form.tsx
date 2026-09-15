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
            Business info for the AI
          </span>
          <textarea
            name="ai_context"
            defaultValue={aiContext ?? ""}
            rows={10}
            placeholder={`Services, hours, service area, pricing structure, differentiators, FAQs — the more detail, the better the replies. e.g.:

Services: Roof repair and full replacement, residential only.
Service area: within 25 miles of Austin, TX.
Pricing: Repairs from $8-$14 per sq ft depending on material (asphalt shingle low end, metal/tile high end). Full replacement quoted after an on-site inspection.
Availability: Same-week for repairs, 2-3 weeks out for full replacements.
Differentiators: Licensed & insured, 10-year workmanship warranty, free on-site estimates, locally owned since 2012.
FAQs: We work with all major insurance companies on storm damage claims.`}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
          <span className="mt-1 block text-xs text-slate-400">
            The AI only uses what you write here — it won&apos;t invent prices, availability, or
            policies. If you give it pricing rates, it can work out a rough ballpark estimate for
            a customer&apos;s specific job (always framed as non-binding, pending a real quote), and
            it always tells the customer a real team member will follow up too.
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
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/20 transition hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
