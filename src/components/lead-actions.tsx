"use client";

import { useActionState, useTransition } from "react";
import { UserCheck } from "lucide-react";
import { claimLead, updateLeadStatus, updateLeadValue } from "@/app/actions/leads";
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

export function LeadActions(props: { leadId: string; status: LeadStatus; dealValue: number | null }) {
  const [isPending, startTransition] = useTransition();
  const [valueState, valueAction, valuePending] = useActionState(updateLeadValue, undefined);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/50">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <UserCheck className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
        <h2 className="text-sm font-semibold text-slate-900">Actions</h2>
      </div>

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
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <form action={valueAction} className="mt-3">
        <input type="hidden" name="lead_id" value={props.leadId} />
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Job value ($)</span>
          <div className="flex gap-2">
            <input
              name="deal_value"
              inputMode="decimal"
              placeholder="e.g. 4500"
              defaultValue={props.dealValue ?? ""}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
            <button
              type="submit"
              disabled={valuePending}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
            >
              {valuePending ? "Saving…" : "Save"}
            </button>
          </div>
        </label>
        <p className="mt-1 text-xs text-slate-400">Counts toward “Revenue won” in Reports when the lead is won.</p>
        {valueState && "error" in valueState && valueState.error ? (
          <p className="mt-1 text-xs text-red-600">{valueState.error}</p>
        ) : null}
        {valueState && "message" in valueState && valueState.message ? (
          <p className="mt-1 text-xs text-emerald-600">{valueState.message}</p>
        ) : null}
      </form>
    </div>
  );
}
