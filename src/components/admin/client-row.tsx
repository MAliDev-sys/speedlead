"use client";

import { useTransition } from "react";
import { updateClientOrg } from "@/app/admin/actions";
import type { Organization } from "@/lib/types/database";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  trialing: "bg-blue-100 text-blue-800",
  suspended: "bg-red-100 text-red-700",
};

export function ClientRow({ org }: { org: Organization }) {
  const [isPending, startTransition] = useTransition();

  function update(field: "plan" | "subscription_status", value: string) {
    const formData = new FormData();
    formData.set("org_id", org.id);
    formData.set("plan", field === "plan" ? value : org.plan);
    formData.set("subscription_status", field === "subscription_status" ? value : org.subscription_status);
    startTransition(() => {
      updateClientOrg(undefined, formData);
    });
  }

  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="px-4 py-3">
        <div className="font-medium text-slate-900">{org.name}</div>
        <div className="text-xs text-slate-400">{org.business_type ?? "—"}</div>
      </td>
      <td className="px-4 py-3 text-slate-600">{org.alert_email ?? "—"}</td>
      <td className="px-4 py-3">
        <select
          defaultValue={org.plan}
          disabled={isPending}
          onChange={(e) => update("plan", e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
        >
          <option value="demo">Demo</option>
          <option value="pro">Pro</option>
          <option value="trial">Trial</option>
          <option value="starter">Starter</option>
          <option value="scale">Scale</option>
        </select>
      </td>
      <td className="px-4 py-3">
        <select
          defaultValue={org.subscription_status}
          disabled={isPending}
          onChange={(e) => update("subscription_status", e.target.value)}
          className={`rounded-full px-2 py-1 text-xs font-medium ${
            STATUS_STYLES[org.subscription_status] ?? "bg-slate-100 text-slate-600"
          }`}
        >
          <option value="active">active</option>
          <option value="trialing">trialing</option>
          <option value="suspended">suspended</option>
        </select>
      </td>
      <td className="px-4 py-3 text-slate-500">{new Date(org.created_at).toLocaleDateString()}</td>
    </tr>
  );
}
