"use client";

import { useActionState } from "react";
import { saveSlackWebhook } from "@/app/actions/integrations";
import type { Integration } from "@/lib/types/database";

export function SlackForm({ integration }: { integration: Integration | null }) {
  const [state, formAction, pending] = useActionState(saveSlackWebhook, undefined);
  const currentUrl =
    integration?.config && typeof integration.config === "object"
      ? String((integration.config as Record<string, unknown>).webhook_url ?? "")
      : "";

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-xs text-slate-500">
        In Slack: create an app at{" "}
        <a href="https://api.slack.com/apps" target="_blank" className="underline">
          api.slack.com/apps
        </a>{" "}
        → Incoming Webhooks → Add New Webhook, then paste the URL below.
      </p>
      <input
        name="webhook_url"
        placeholder="https://hooks.slack.com/services/…"
        defaultValue={currentUrl}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
      />
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
      {integration?.status === "connected" ? (
        <span className="ml-3 text-xs font-medium text-emerald-600">● Connected</span>
      ) : (
        <span className="ml-3 text-xs font-medium text-slate-400">● Not connected</span>
      )}
    </form>
  );
}
