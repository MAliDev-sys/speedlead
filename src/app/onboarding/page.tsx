"use client";

import { useActionState } from "react";
import { createOrganization } from "@/app/actions/orgs";

const BUSINESS_TYPES = [
  "HVAC",
  "Plumbing",
  "Electrical",
  "Roofing",
  "Landscaping",
  "Pest Control",
  "Cleaning",
  "General Contractor",
  "Other",
];

export default function OnboardingPage() {
  const [state, formAction, pending] = useActionState(createOrganization, undefined);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Set up your business</h1>
        <p className="mt-1 text-sm text-slate-500">
          One workspace per business. You can invite teammates after this.
        </p>

        <form action={formAction} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Business name</span>
            <input
              name="name"
              required
              placeholder="Acme Heating &amp; Air"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Business type</span>
            <select
              name="business_type"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
            >
              {BUSINESS_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Team alert email
            </span>
            <input
              name="alert_email"
              type="email"
              placeholder="you@yourbusiness.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
            />
            <span className="mt-1 block text-xs text-slate-400">
              Used as the reply-to address on lead confirmation emails.
            </span>
          </label>

          {state && "error" in state && state.error ? (
            <p className="text-sm text-red-600">{state.error}</p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {pending ? "Creating…" : "Create workspace"}
          </button>
        </form>
      </div>
    </main>
  );
}
