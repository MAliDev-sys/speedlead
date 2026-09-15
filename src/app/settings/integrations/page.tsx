import { PhoneMissed, Bot, Bell, Plug, type LucideIcon } from "lucide-react";
import { requireCurrentOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { SlackForm } from "@/components/settings/slack-form";
import { LeadSourceForm } from "@/components/settings/lead-source-form";
import { PhoneNumberPanel } from "@/components/settings/phone-number-panel";
import { AutoResponseForm } from "@/components/settings/auto-response-form";
import { getEnv } from "@/lib/env";
import type { Integration, LeadSource, PhoneNumber } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const { org, userId } = await requireCurrentOrg();
  const supabase = await createClient();
  const env = getEnv();
  const appUrl = env.NEXT_PUBLIC_APP_URL;
  const inboundDomain = env.RESEND_INBOUND_DOMAIN ?? null;

  const [{ data: fetchedSources }, { data: slackIntegration }, { data: phoneNumber }] = await Promise.all([
    supabase.from("lead_sources").select("*").eq("org_id", org.id).order("created_at"),
    supabase.from("integrations").select("*").eq("org_id", org.id).eq("type", "slack").maybeSingle(),
    supabase.from("phone_numbers").select("*").eq("org_id", org.id).maybeSingle(),
  ]);

  let sources = fetchedSources ?? [];

  // Backfill: orgs created before the "Email" lead source existed never
  // got one auto-provisioned (see app/actions/orgs.ts). Create it lazily
  // here on first visit rather than requiring a one-off migration script.
  if (!sources.some((s) => s.type === "email")) {
    const { data: created } = await supabase
      .from("lead_sources")
      .insert({ org_id: org.id, type: "email", name: "Email" })
      .select()
      .single();
    if (created) sources = [...sources, created];
  }

  return (
    <DashboardShell org={org} userId={userId}>
      <div className="space-y-6">
        <section>
          <h1 className="text-xl font-bold text-slate-900">Integrations</h1>
          <p className="mt-1 text-sm text-slate-500">
            Connect lead sources and where the team gets notified.
          </p>
        </section>

        <Section
          icon={PhoneMissed}
          title="Missed-call text-back"
          description="Ring a real phone; auto-text anyone who doesn't get answered."
        >
          <PhoneNumberPanel phoneNumber={phoneNumber as PhoneNumber | null} />
        </Section>

        <Section
          icon={Bot}
          title="Auto-response"
          description="What the instant reply actually says — a fixed message, or an AI reply grounded in your business info."
        >
          <AutoResponseForm mode={org.auto_respond_mode} aiContext={org.ai_context} />
        </Section>

        <Section icon={Bell} title="Slack notifications" description="Alert your team the moment a lead comes in.">
          <SlackForm integration={slackIntegration as Integration | null} />
        </Section>

        <Section
          icon={Plug}
          title="Lead sources"
          description="Webhook URLs (Zapier, Google LSA, Facebook Lead Ads), the embeddable website form, and a dedicated inbound email address."
        >
          <div className="space-y-3">
            {(sources as LeadSource[]).map((source) => (
              <SourceRow key={source.id} source={source} appUrl={appUrl} inboundDomain={inboundDomain} />
            ))}
          </div>
          <LeadSourceForm />
        </Section>
      </div>
    </DashboardShell>
  );
}

function Section(props: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <props.icon className="h-4.5 w-4.5" strokeWidth={2} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{props.title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{props.description}</p>
        </div>
      </div>
      <div className="mt-4">{props.children}</div>
    </section>
  );
}

function SourceRow({
  source,
  appUrl,
  inboundDomain,
}: {
  source: LeadSource;
  appUrl: string;
  inboundDomain: string | null;
}) {
  if (source.type === "email") {
    return (
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-800">{source.name}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase text-slate-500">
            {source.type}
          </span>
        </div>
        {inboundDomain ? (
          <>
            <code className="mt-2 block truncate rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-600">
              {source.public_token}@{inboundDomain}
            </code>
            <p className="mt-2 text-xs text-slate-400">
              Give customers this address, or set your existing business inbox to auto-forward here.
            </p>
          </>
        ) : (
          <p className="mt-2 text-xs text-amber-600">
            Not set up yet — the platform operator needs to configure Resend inbound receiving
            (see docs/SETUP.md).
          </p>
        )}
      </div>
    );
  }

  const url =
    source.type === "form"
      ? `${appUrl}/api/leads/submit/${source.public_token}`
      : `${appUrl}/api/webhooks/lead/${source.public_token}`;

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-800">{source.name}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase text-slate-500">
          {source.type}
        </span>
      </div>
      <code className="mt-2 block truncate rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-600">
        {url}
      </code>
      {source.type === "form" ? (
        <code className="mt-2 block overflow-x-auto rounded-lg bg-slate-900 px-2 py-2 text-xs text-slate-100">
          {`<script src="${appUrl}/widget.js" data-token="${source.public_token}" async></script>`}
        </code>
      ) : null}
    </div>
  );
}
