"use client";

import { useActionState, useState } from "react";
import { saveBusinessProfile } from "@/app/actions/business-profile";
import type { Organization } from "@/lib/types/database";

const INPUT =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 disabled:text-slate-400";

const BUSINESS_TYPES = [
  { value: "", label: "Select…" },
  { value: "hvac", label: "HVAC" },
  { value: "plumbing", label: "Plumbing" },
  { value: "roofing", label: "Roofing" },
  { value: "electrical", label: "Electrical" },
  { value: "general", label: "General contractor / other" },
];

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Asia/Karachi",
  "Asia/Dubai",
  "Australia/Sydney",
];

export function BusinessProfileForm({
  org,
  canEditOrg,
  fullName,
  phone,
}: {
  org: Organization;
  canEditOrg: boolean;
  fullName: string | null;
  phone: string | null;
}) {
  const [state, formAction, pending] = useActionState(saveBusinessProfile, undefined);
  const [preview, setPreview] = useState<string | null>(org.logo_url);
  const [removeLogo, setRemoveLogo] = useState(false);

  const timezones = TIMEZONES.includes(org.timezone) ? TIMEZONES : [org.timezone, ...TIMEZONES];
  const businessTypes = BUSINESS_TYPES.some((t) => t.value === (org.business_type ?? ""))
    ? BUSINESS_TYPES
    : [...BUSINESS_TYPES, { value: org.business_type ?? "", label: org.business_type ?? "" }];

  return (
    <form action={formAction} className="space-y-6">
      <Card title="Business" description="Shown to customers in replies and across your dashboard.">
        {!canEditOrg ? (
          <p className="mb-3 text-xs text-amber-600">
            Only the account owner or an admin can change business details.
          </p>
        ) : null}

        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {preview && !removeLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Business logo" className="h-full w-full object-contain" />
            ) : (
              <span className="text-xs text-slate-400">No logo</span>
            )}
          </span>
          <div className="space-y-1">
            <input
              type="file"
              name="logo"
              accept="image/png,image/jpeg,image/webp"
              disabled={!canEditOrg}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setPreview(URL.createObjectURL(file));
                  setRemoveLogo(false);
                }
              }}
              className="block text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700"
            />
            <p className="text-xs text-slate-400">PNG, JPG or WebP, up to 2MB. Square works best.</p>
            {org.logo_url ? (
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <input
                  type="checkbox"
                  name="remove_logo"
                  checked={removeLogo}
                  disabled={!canEditOrg}
                  onChange={(e) => setRemoveLogo(e.target.checked)}
                />
                Remove current logo
              </label>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Business name">
            <input name="name" required defaultValue={org.name} disabled={!canEditOrg} className={INPUT} />
          </Field>
          <Field label="Business type">
            <select name="business_type" defaultValue={org.business_type ?? ""} disabled={!canEditOrg} className={INPUT}>
              {businessTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Business phone">
            <input name="business_phone" type="tel" defaultValue={org.business_phone ?? ""} disabled={!canEditOrg} className={INPUT} />
          </Field>
          <Field label="Website">
            <input
              name="website"
              type="url"
              placeholder="https://example.com"
              defaultValue={org.website ?? ""}
              disabled={!canEditOrg}
              className={INPUT}
            />
          </Field>
          <Field label="Business address / service area" wide>
            <input name="business_address" defaultValue={org.business_address ?? ""} disabled={!canEditOrg} className={INPUT} />
          </Field>
          <Field label="Timezone">
            <select name="timezone" defaultValue={org.timezone} disabled={!canEditOrg} className={INPUT}>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <Card title="Team alerts" description="Where new-lead alerts go when Slack isn't connected (or alongside it).">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Alert email">
            <input name="alert_email" type="email" defaultValue={org.alert_email ?? ""} disabled={!canEditOrg} className={INPUT} />
          </Field>
          <Field label="Alert phone">
            <input name="alert_phone" type="tel" defaultValue={org.alert_phone ?? ""} disabled={!canEditOrg} className={INPUT} />
          </Field>
        </div>
      </Card>

      <Card title="Your account" description="Your own details as a team member.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name">
            <input name="full_name" defaultValue={fullName ?? ""} className={INPUT} />
          </Field>
          <Field label="Your phone">
            <input name="phone" type="tel" defaultValue={phone ?? ""} className={INPUT} />
          </Field>
        </div>
      </Card>

      {state && "error" in state && state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state && "message" in state && state.message ? (
        <p className="text-sm text-emerald-600">{state.message}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/20 transition hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

function Card(props: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50">
      <h2 className="text-sm font-semibold text-slate-900">{props.title}</h2>
      <p className="mt-0.5 text-sm text-slate-500">{props.description}</p>
      <div className="mt-4">{props.children}</div>
    </section>
  );
}

function Field(props: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${props.wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-xs font-medium text-slate-500">{props.label}</span>
      {props.children}
    </label>
  );
}
