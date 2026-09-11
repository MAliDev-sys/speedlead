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
  const { org } = await requireCurrentOrg();
  const supabase = await createClient();
  const env = getEnv();
  const appUrl = env.NEXT_PUBLIC_APP_URL;
  const inboundDomain = env.RESEND_INBOUND_DOMAIN ?? null;

  const [{ data: sources }, { data: slackIntegration }, { data: phoneNumber }] = await Promise.all([
    supabase.from("lead_sources").select("*").eq("org_id", org.id).order("created_at"),
    supabase.from("integrations").select("*").eq("org_id", org.id).eq("type", "slack").maybeSingle(),
    supabase.from("phone_numbers").select("*").eq("org_id", org.id).maybeSingle(),
  ]);

  return (
    <DashboardShell org={org}>
      <div className="space-y-8">
        <section>
          <h1 className="text-xl font-semibold text-slate-900">Integrations</h1>
          <p className="mt-1 text-sm text-slate-500">
            Connect lead sources and where the team gets notified.
          </p>
        </section>

        <Section title="Missed-call text-back" description="Ring a real phone; auto-text anyone who doesn't get answered.">
          <PhoneNumberPanel phoneNumber={phoneNumber as PhoneNumber | null} />
        </Section>

        <Section
          title="Auto-response"
          description="What the instant reply actually says — a fixed message, or an AI reply grounded in your business info."
        >
          <AutoResponseForm mode={org.auto_respond_mode} aiContext={org.ai_context} />
        </Section>

        <Section title="Slack notifications" description="Alert your team the moment a lead comes in.">
          <SlackForm integration={slackIntegration as Integration | null} />
        </Section>

        <Section
          title="Lead sources"
          description="Webhook URLs (Zapier, Google LSA, Facebook Lead Ads), the embeddable website form, and a dedicated inbound email address."
        >
          <div className="space-y-3">
            {(sources as LeadSource[] | null ?? []).map((source) => (
              <SourceRow key={source.id} source={source} appUrl={appUrl} inboundDomain={inboundDomain} />
            ))}
          </div>
          <LeadSourceForm />
        </Section>
      </div>
    </DashboardShell>
  );
}

function Section(props: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-900">{props.title}</h2>
      <p className="mt-1 text-sm text-slate-500">{props.description}</p>
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
      <div className="rounded-lg border border-slate-200 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-800">{source.name}</span>
          <span className="text-xs uppercase text-slate-400">{source.type}</span>
        </div>
        {inboundDomain ? (
          <>
            <code className="mt-2 block truncate rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
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
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-800">{source.name}</span>
        <span className="text-xs uppercase text-slate-400">{source.type}</span>
      </div>
      <code className="mt-2 block truncate rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
        {url}
      </code>
      {source.type === "form" ? (
        <code className="mt-2 block overflow-x-auto rounded bg-slate-900 px-2 py-2 text-xs text-slate-100">
          {`<script src="${appUrl}/widget.js" data-token="${source.public_token}" async></script>`}
        </code>
      ) : null}
    </div>
  );
}
