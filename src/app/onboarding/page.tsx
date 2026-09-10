"use client";

import { useActionState } from "react";
import { Zap } from "lucide-react";
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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
            <Zap className="h-5.5 w-5.5" strokeWidth={2.5} />
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm shadow-slate-200/60">
          <h1 className="text-xl font-bold text-slate-900">Set up your business</h1>
          <p className="mt-1 text-sm text-slate-500">
            One workspace per business. You can invite teammates after this.
          </p>

          <form action={formAction} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Business name</span>
              <input
                name="name"
                required
                placeholder="Acme Heating &amp; Air"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Business type</span>
              <select
                name="business_type"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              >
                {BUSINESS_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Team alert email
              </span>
              <input
                name="alert_email"
                type="email"
                placeholder="you@yourbusiness.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
              <span className="mt-1.5 block text-xs text-slate-400">
                Used as the reply-to address on lead confirmation emails.
              </span>
            </label>

            {state && "error" in state && state.error ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
            ) : null}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-600/30 transition hover:bg-brand-700 disabled:opacity-60"
            >
              {pending ? "Creating…" : "Create workspace"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
