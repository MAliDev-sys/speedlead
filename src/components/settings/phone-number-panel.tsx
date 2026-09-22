"use client";

import { useState, useActionState } from "react";
import {
  provisionPhoneNumber,
  connectExistingPhoneNumber,
  updateForwardingNumber,
} from "@/app/actions/integrations";
import type { PhoneNumber } from "@/lib/types/database";

export function PhoneNumberPanel({ phoneNumber }: { phoneNumber: PhoneNumber | null }) {
  if (phoneNumber) {
    return <ConnectedPanel phoneNumber={phoneNumber} />;
  }
  return <ProvisionPanel />;
}

function ConnectedPanel({ phoneNumber }: { phoneNumber: PhoneNumber }) {
  const [state, formAction, pending] = useActionState(updateForwardingNumber, undefined);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-700">
        SpeedLead number: <span className="font-mono">{phoneNumber.phone_number}</span>{" "}
        <span className="text-xs font-medium text-emerald-600">● Active</span>
      </p>
      <p className="text-xs text-slate-500">
        Give this number to customers (or forward your existing business line to it). Calls ring{" "}
        <span className="font-mono">{phoneNumber.forwarding_number}</span>; if unanswered after{" "}
        {phoneNumber.ring_timeout_seconds}s, the caller is texted automatically.
      </p>
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <label>
          <span className="mb-1 block text-xs font-medium text-slate-500">Forwards to</span>
          <input
            name="forwarding_number"
            defaultValue={phoneNumber.forwarding_number ?? ""}
            placeholder="+15551234567"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Update"}
        </button>
        {state && "error" in state && state.error ? (
          <p className="w-full text-sm text-red-600">{state.error}</p>
        ) : null}
        {state && "message" in state && state.message ? (
          <p className="w-full text-sm text-emerald-600">{state.message}</p>
        ) : null}
      </form>
    </div>
  );
}

function ProvisionPanel() {
  const [mode, setMode] = useState<"new" | "existing">("new");

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode("new")}
          className={`flex-1 rounded-md px-3 py-1.5 font-medium transition ${
            mode === "new" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
          }`}
        >
          Get a new number
        </button>
        <button
          type="button"
          onClick={() => setMode("existing")}
          className={`flex-1 rounded-md px-3 py-1.5 font-medium transition ${
            mode === "existing" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
          }`}
        >
          Connect a number you already own
        </button>
      </div>
      {mode === "new" ? <NewNumberForm /> : <ExistingNumberForm />}
    </div>
  );
}

function NewNumberForm() {
  const [state, formAction, pending] = useActionState(provisionPhoneNumber, undefined);

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm text-slate-500">
        Get a dedicated number for this business (~$1.15/mo billed to the platform). Missed calls
        ring your real phone first; if you don&apos;t pick up, the caller gets an instant text.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label>
          <span className="mb-1 block text-xs font-medium text-slate-500">Forward calls to</span>
          <input
            name="forwarding_number"
            required
            placeholder="+15551234567"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-slate-500">Area code (optional)</span>
          <input
            name="area_code"
            placeholder="512"
            maxLength={3}
            className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/20 transition hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Provisioning…" : "Get a number"}
        </button>
      </div>
      {state && "error" in state && state.error ? (
        <p className="text-sm text-red-600">{state.error}</p>
      ) : null}
      {state && "message" in state && state.message ? (
        <p className="text-sm text-emerald-600">{state.message}</p>
      ) : null}
    </form>
  );
}

function ExistingNumberForm() {
  const [state, formAction, pending] = useActionState(connectExistingPhoneNumber, undefined);

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm text-slate-500">
        Already bought a number directly through Twilio? Enter it here — no new purchase, this
        just points that number&apos;s webhooks at this app. It must be under the same Twilio
        account this deployment is connected to (see docs/SETUP.md).
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label>
          <span className="mb-1 block text-xs font-medium text-slate-500">Your Twilio number</span>
          <input
            name="phone_number"
            required
            placeholder="+15551234567"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-slate-500">Forward calls to</span>
          <input
            name="forwarding_number"
            required
            placeholder="+15551234567"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/20 transition hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Connecting…" : "Connect number"}
        </button>
      </div>
      {state && "error" in state && state.error ? (
        <p className="text-sm text-red-600">{state.error}</p>
      ) : null}
      {state && "message" in state && state.message ? (
        <p className="text-sm text-emerald-600">{state.message}</p>
      ) : null}
    </form>
  );
}
