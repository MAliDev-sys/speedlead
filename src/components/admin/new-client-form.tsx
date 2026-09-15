"use client";

import { useActionState } from "react";
import { createClientOrg } from "@/app/admin/actions";

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

export function NewClientForm() {
  const [state, formAction, pending] = useActionState(createClientOrg, undefined);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <label className="lg:col-span-2">
        <span className="mb-1 block text-xs font-medium text-slate-500">Business name</span>
        <input
          name="business_name"
          required
          placeholder="Acme Roofing"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium text-slate-500">Type</span>
        <select name="business_type" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20">
          {BUSINESS_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="lg:col-span-2">
        <span className="mb-1 block text-xs font-medium text-slate-500">Owner email</span>
        <input
          name="owner_email"
          type="email"
          required
          placeholder="owner@acmeroofing.com"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium text-slate-500">Plan</span>
        <select name="plan" defaultValue="demo" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20">
          <option value="demo">Demo</option>
          <option value="pro">Pro</option>
        </select>
      </label>
      <div className="flex items-end">
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/20 transition hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Creating…" : "Invite"}
        </button>
      </div>
      {state && "error" in state && state.error ? (
        <p className="sm:col-span-2 lg:col-span-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      {state && "message" in state && state.message ? (
        <p className="sm:col-span-2 lg:col-span-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
