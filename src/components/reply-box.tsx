"use client";

import { useActionState, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { sendManualReply } from "@/app/actions/messages";
import type { Lead } from "@/lib/types/database";

export function ReplyBox({ lead }: { lead: Lead }) {
  const [state, formAction, pending] = useActionState(sendManualReply, undefined);
  const [channel, setChannel] = useState<"sms" | "email">(lead.phone ? "sms" : "email");
  const [body, setBody] = useState("");

  if (!lead.phone && !lead.email) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/50">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <MessageSquareText className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
        <h2 className="text-sm font-semibold text-slate-900">Reply</h2>
      </div>

      <form action={formAction} onSubmit={() => setBody("")} className="mt-3 space-y-3">
        <input type="hidden" name="lead_id" value={lead.id} />
        <input type="hidden" name="channel" value={channel} />

        {lead.phone && lead.email ? (
          <div className="flex gap-2">
            <ChannelTab label="SMS" active={channel === "sms"} onClick={() => setChannel("sms")} />
            <ChannelTab label="Email" active={channel === "email"} onClick={() => setChannel("email")} />
          </div>
        ) : null}

        <textarea
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder={channel === "sms" ? "Type a text reply…" : "Type an email reply…"}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />

        {state && "error" in state && state.error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
        ) : null}
        {state && "message" in state && state.message ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600">{state.message}</p>
        ) : null}

        <button
          type="submit"
          disabled={pending || !body.trim()}
          className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/20 transition hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Sending…" : `Send ${channel === "sms" ? "text" : "email"}`}
        </button>
      </form>
    </div>
  );
}

function ChannelTab(props: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        props.active ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
      }`}
    >
      {props.label}
    </button>
  );
}
