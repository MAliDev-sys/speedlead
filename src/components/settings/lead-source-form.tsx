"use client";

import { useActionState } from "react";
import { createLeadSource } from "@/app/actions/integrations";

export function LeadSourceForm() {
  const [state, formAction, pending] = useActionState(createLeadSource, undefined);

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
      <label className="flex-1 min-w-[160px]">
        <span className="mb-1 block text-xs font-medium text-slate-500">Name</span>
        <input
          name="name"
          required
          placeholder="e.g. Google LSA"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium text-slate-500">Type</span>
        <select name="type" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="webhook">Webhook</option>
          <option value="form">Embeddable form</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add source"}
      </button>
      {state && "error" in state && state.error ? (
        <p className="w-full text-sm text-red-600">{state.error}</p>
      ) : null}
    </form>
  );
}
