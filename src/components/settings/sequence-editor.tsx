"use client";

import { useState, useTransition } from "react";
import { saveSequence, type SequenceStep } from "@/app/actions/sequences";

export function SequenceEditor({
  initialSteps,
  isActive,
}: {
  initialSteps: SequenceStep[];
  isActive: boolean;
}) {
  const [steps, setSteps] = useState<SequenceStep[]>(initialSteps);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function updateStep(index: number, patch: Partial<SequenceStep>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    setSaved(false);
  }

  function addStep() {
    setSteps((prev) => [...prev, { delay_minutes: 60, channel: "sms", template: "" }]);
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSave() {
    startTransition(async () => {
      await saveSequence(steps);
      setSaved(true);
    });
  }

  return (
    <div className="space-y-4">
      {!isActive && steps === initialSteps ? (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
          This is a suggested starting sequence — click Save to activate it.
        </p>
      ) : null}

      {steps.map((step, i) => (
        <div key={i} className="grid grid-cols-12 items-start gap-2 rounded-xl border border-slate-200 p-3">
          <label className="col-span-3">
            <span className="mb-1 block text-xs text-slate-500">Delay (minutes)</span>
            <input
              type="number"
              min={1}
              value={step.delay_minutes}
              onChange={(e) => updateStep(i, { delay_minutes: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <label className="col-span-2">
            <span className="mb-1 block text-xs text-slate-500">Channel</span>
            <select
              value={step.channel}
              onChange={(e) => updateStep(i, { channel: e.target.value as SequenceStep["channel"] })}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
            </select>
          </label>
          <label className="col-span-6">
            <span className="mb-1 block text-xs text-slate-500">Message</span>
            <textarea
              value={step.template}
              onChange={(e) => updateStep(i, { template: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <button
            onClick={() => removeStep(i)}
            className="col-span-1 mt-5 text-xs font-medium text-red-500 hover:underline"
          >
            Remove
          </button>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <button
          onClick={addStep}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          + Add step
        </button>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm shadow-brand-600/20 transition hover:bg-brand-700 disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save sequence"}
        </button>
        {saved ? <span className="text-sm text-emerald-600">Saved</span> : null}
      </div>
    </div>
  );
}
