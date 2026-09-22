"use client";

import { useActionState } from "react";
import { saveEmailIntegration } from "@/app/actions/integrations";
import type { Integration } from "@/lib/types/database";

const MASKED_PASSWORD = "••••••••";

export function EmailSendingForm({ integration }: { integration: Integration | null }) {
  const [state, formAction, pending] = useActionState(saveEmailIntegration, undefined);
  const config =
    integration?.config && typeof integration.config === "object"
      ? (integration.config as Record<string, unknown>)
      : null;
  const isConnected = integration?.status === "connected";

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-xs text-slate-500">
        Optional — by default, replies to this business&apos;s leads go out from SpeedLead&apos;s shared
        sender. Once this business has its own domain email, enter its SMTP details below so replies
        come from their own address instead (e.g. a Gmail App Password, or their domain host&apos;s SMTP
        credentials). Leave every field blank and save to disconnect and revert to the shared sender.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-xs font-medium text-slate-600">From email</span>
          <input
            name="from_email"
            type="email"
            placeholder="quotes@theirbusiness.com"
            defaultValue={config ? String(config.from_email ?? "") : ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-medium text-slate-600">SMTP host</span>
          <input
            name="smtp_host"
            placeholder="smtp.gmail.com"
            defaultValue={config ? String(config.smtp_host ?? "") : ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-medium text-slate-600">SMTP port</span>
          <input
            name="smtp_port"
            placeholder="587"
            defaultValue={config ? String(config.smtp_port ?? "587") : "587"}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-medium text-slate-600">SMTP username</span>
          <input
            name="smtp_user"
            placeholder="quotes@theirbusiness.com"
            defaultValue={config ? String(config.smtp_user ?? "") : ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="text-xs font-medium text-slate-600">SMTP password / app password</span>
          <input
            name="smtp_pass"
            type="password"
            placeholder={isConnected ? MASKED_PASSWORD : "App password"}
            defaultValue={isConnected ? MASKED_PASSWORD : ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </label>
      </div>
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
      {isConnected ? (
        <span className="ml-3 text-xs font-medium text-emerald-600">● Connected</span>
      ) : (
        <span className="ml-3 text-xs font-medium text-slate-400">● Using shared platform sender</span>
      )}
    </form>
  );
}
