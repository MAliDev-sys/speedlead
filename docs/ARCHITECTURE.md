# SpeedLead — Architecture

A multi-tenant "speed-to-lead" SaaS: the moment a lead comes in (web form,
webhook from Google LSA/Facebook/Zapier, or a missed call), the system fires
an instant automated SMS/email/Slack/WhatsApp response, notifies the
business's team, and runs a follow-up drip sequence until a human takes over.
Sold to local US service businesses (HVAC, plumbing, roofing, etc.).

## Stack (optimized for lowest cost at low-to-mid volume)

| Layer | Choice | Why |
|---|---|---|
| Frontend + backend | Next.js 15 (App Router, TS) on Vercel | One codebase, free Hobby tier to start, serverless API routes = no server to manage |
| Database + Auth | Supabase (Postgres + Auth + RLS) | Free tier covers MVP; RLS gives real multi-tenant isolation for free |
| SMS + missed-call capture | Twilio (Programmable SMS + Voice) | Pay-as-you-go, ~$0.0079/SMS, ~$1.15/mo per number; industry standard |
| WhatsApp | Twilio WhatsApp API (reuses same Twilio account) | Avoids a separate Meta Cloud API integration for MVP |
| Email | Resend + React Email | 3,000 emails/month free, great DX |
| Team alerts | Slack Incoming Webhooks + Web API | Free, high perceived value ("claim this lead" button) |
| Background/delayed jobs | Postgres `scheduled_jobs` table + a cron trigger | No extra paid job-queue vendor; good enough latency (1-5 min) for *follow-up* steps (the *first* response is synchronous, not queued) |
| Billing | Stripe Billing (subscriptions + usage) | Standard, ~2.9%+30¢ per charge, no monthly fee |

Total fixed cost at zero customers: **$0/mo** (everything above has a free
tier). Variable cost only kicks in with Twilio numbers/usage once you have
paying tenants — trivially covered by their subscription.

## Tenancy model

- `organizations` = one row per customer business (tenant).
- `organization_members` links Supabase Auth users to orgs with a role
  (`owner`/`admin`/`agent`).
- Every tenant-scoped table has `org_id` + a Postgres RLS policy restricting
  rows to members of that org. Browser/dashboard code always uses the
  Supabase anon key + user session (RLS enforced). Server-side webhook
  handlers use the **service role key** (bypasses RLS) because they act on
  behalf of the platform, not a logged-in user — that key never reaches the
  browser.

## The speed-to-lead flow

```
 Lead source                Ingestion                 Instant response         Follow-up
 ───────────                ─────────                 ─────────────────        ──────────
 Website form/widget  ──►   POST /api/leads/submit/:token
 Zapier/LSA/FB webhook ──►  POST /api/webhooks/lead/:token
 Missed call (Twilio) ──►   /api/webhooks/twilio/voice-status
                                   │
                                   ▼
                        1. insert `leads` row
                        2. insert `lead_events` (created)
                        3. notifyNewLead() — SYNCHRONOUS, in the same
                           request/response cycle so the reply goes out
                           in seconds, not on a queue:
                             - Twilio SMS to the lead ("Thanks! We got
                               your request, a tech will call you shortly.")
                             - Slack message to the team channel with a
                               "Claim" button
                             - Email confirmation (if email present)
                             - WhatsApp (if enabled + lead has WhatsApp)
                        4. schedule sequence steps into `scheduled_jobs`
                           (e.g. +15 min nudge if unclaimed, +1 day,
                           +3 day check-in) — these are NOT time critical,
                           so a table + periodic worker is fine.
                                   │
                                   ▼
                     cron worker (every 1 min) processes due
                     `scheduled_jobs` rows and sends the next step,
                     unless the lead already responded/was marked won
                     (a DB trigger auto-cancels pending jobs in that case).
```

Why the first response must be synchronous: the entire value proposition of
"speed to lead" is responding in seconds/minutes, not on the next queue tick.
Only the *nurture* steps (which are inherently delayed by design) go through
the job table.

## Missed-call capture

1. Each org gets a Twilio number (`phone_numbers` table) that forwards to the
   business's real cell/office number.
2. Twilio Voice webhook (`/api/webhooks/twilio/voice`) returns TwiML that
   `<Dial>`s the forwarding number with a timeout and an `action` callback.
3. If the dial result is `no-answer`/`busy`/`failed`, the action callback
   (`/api/webhooks/twilio/voice-status`) creates a lead from the caller ID and
   fires the same `notifyNewLead()` path — the caller gets an instant
   "Sorry we missed your call, texting you now" SMS.

## Embeddable widget

`/widget.js` (public, cacheable) is a small vanilla-JS snippet businesses
paste into their site:
```html
<script src="https://app.speedlead.io/widget.js" data-token="pub_xxx" async></script>
```
It renders a minimal lead form and POSTs to the public
`/api/leads/submit/:token` endpoint (CORS-enabled, rate-limited, no auth
required since the token is the capability).

## Directory layout

```
src/
  app/
    (dashboard)/            authenticated app: leads, settings, analytics
    (marketing)/            public landing page
    api/
      leads/submit/[token]/route.ts     public form + generic API intake
      webhooks/lead/[token]/route.ts    generic webhook intake (Zapier/LSA/FB)
      webhooks/twilio/voice/route.ts    incoming call -> TwiML
      webhooks/twilio/voice-status/route.ts   missed-call detection
      webhooks/twilio/sms/route.ts      inbound SMS replies
      webhooks/slack/interactions/route.ts    "Claim" button handler
      webhooks/stripe/route.ts          billing events
      cron/process-jobs/route.ts        drip-sequence worker (called by cron)
  lib/
    supabase/ (server.ts, admin.ts, client.ts)
    notify/  (sms.ts, email.ts, slack.ts, whatsapp.ts, index.ts)
    twilio.ts, resend.ts, slack.ts, stripe.ts
  components/  dashboard UI (shadcn/ui + Tailwind)
supabase/migrations/  SQL schema + RLS policies
```

## Gotchas worth knowing

- **`src/lib/types/database.ts` uses `type`, never `interface`.** supabase-js
  checks each table against an internal `GenericTable` constraint via a
  conditional-type `extends` check, and TypeScript does not treat a plain
  `interface` as assignable to an index-signature type in that position —
  only object type aliases are. Declaring a table row as `interface` instead
  of `type` compiles fine but silently makes `.insert()`/`.update()` on that
  table type as `never`, with no error at the interface's own definition.
  If you hand-add a table here (or anywhere a value flows into a jsonb
  column), keep it a `type`.
- **Embedded/nested `select()` (e.g. `organization_members.select("organizations(*)")`)
  isn't used here** — our hand-written Database type doesn't populate each
  table's `Relationships` (the real foreign-key metadata Supabase's CLI
  codegen fills in), so postgrest-js can't type-check that join shape. We
  do two plain queries instead (see `lib/org.ts`). Once you run
  `supabase gen types`, embedded selects will type-check normally.
- **Next.js 16 renamed `middleware.ts` → `proxy.ts`** (`export function proxy`
  instead of `export function middleware`). This project already uses the
  new convention (`src/proxy.ts`).

## Security notes

- Webhook tokens are opaque random 32-hex-char strings, not sequential IDs.
- Twilio webhooks are verified via the `X-Twilio-Signature` header.
- Stripe webhooks are verified via the signing secret.
- Slack requests are verified via the signing secret.
- Service-role Supabase key only ever used in server-only modules (`server-only` package + no `NEXT_PUBLIC_` prefix).
