"use client";

import { useTransition } from "react";
import { claimLead, updateLeadStatus } from "@/app/actions/leads";
import type { LeadStatus } from "@/lib/types/database";

const STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "responded",
  "qualified",
  "won",
  "lost",
  "spam",
];

export function LeadActions(props: { leadId: string; status: LeadStatus }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Actions</h2>

      <button
        disabled={isPending}
        onClick={() => startTransition(() => claimLead(props.leadId))}
        className="mt-3 w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/20 transition hover:bg-brand-700 disabled:opacity-60"
      >
        Claim this lead
      </button>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium text-slate-500">Status</span>
        <select
          defaultValue={props.status}
          disabled={isPending}
          onChange={(e) => startTransition(() => updateLeadStatus(props.leadId, e.target.value))}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
