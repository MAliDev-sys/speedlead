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

## Access model: invite-only, not self-serve

There is no public signup. A `platform_admins` table (service-role-only —
no RLS policy grants it to anyone, including its own members) gates a
`/admin` area where the platform operator creates every client workspace
and invites its owner user directly (Supabase Admin API
`inviteUserByEmail`), after handling payment entirely outside this app
(Payoneer, etc. — deliberately no Stripe/billing integration here). Each
org's `subscription_status` (`active` / `trialing` / `suspended`) is the
access switch: `requireCurrentOrg()` redirects to `/suspended` the moment
an admin flips it, with no code deploy needed. `plan` (`demo` / `pro` /
...) is currently just a label the admin sets — no feature gating is
wired to it yet.

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

## Auto-response: answering the customer's actual query, fast

The instant SMS/email reply can work two ways, per org (`organizations.auto_respond_mode`):

- **`template`** (default, free) — a fixed acknowledgment ("thanks, we got
  your request, someone will call you shortly").
- **`ai`** — `lib/ai-respond.ts` asks Claude Haiku 4.5 to write a short
  reply grounded *only* in the business's own `ai_context` (services,
  hours, pricing notes the owner enters in Settings). It's instructed to
  never invent facts, never claim to be human, and always note a real team
  member will also follow up.

**Guaranteeing the reply lands within seconds (well inside the product's
30-60s bar), not just "eventually":**
- `generateAiReply()` never throws and carries an 8s hard timeout
  (`AbortController` via the SDK's per-request `timeout` option) — on any
  failure, rate limit, or slow response it returns `null` instead of
  blocking.
- Every call site falls back to the fixed template the instant that
  happens, so a reply always goes out — "either hardcoded or AI-generated"
  is enforced as a fallback chain, not a choice that can silently fail.
- In `notifyNewLead()`, the AI call is kicked off immediately and run
  *concurrently* with the SMS/email/Slack sends (each channel `await`s the
  same shared promise rather than the pipeline waiting on it serially), so
  it never adds latency beyond whichever channel is already slowest.
- Inbound SMS replies (`/api/webhooks/twilio/sms`) get the same treatment:
  in `ai` mode, a follow-up question is answered inline in the same Twilio
  webhook response (TwiML `<Message>`), comfortably inside Twilio's ~15s
  webhook timeout.

**Conversation memory:** `generateAiReply()` takes the lead's prior
messages (`lib/conversation.ts` → `getConversationHistory()`, capped at the
most recent 20 turns) as real multi-turn Claude `messages`, not just the
latest text in isolation — it can reference what the customer already said
two messages ago (a mentioned roof size, a stated timeline) instead of
re-asking or answering each message as if it were the first. Business
info + the fixed rules live in `system` (static across turns); only
sms/email/whatsapp messages count as "the conversation" (Slack is an
internal team alert the customer never sees) and failed sends are
excluded, since we never actually said that to them. Every call site
fetches history *before* logging the new inbound message, so the new
message is never double-counted as both "history" and "the message to
answer."

**Email threading:** a second email from a sender who already has a lead
for that org continues the existing lead (logged, AI-replied-to with
history, Slack-pinged) instead of spawning a duplicate — the same
most-recent-lead-by-contact lookup the SMS webhook already used, now
mirrored in `/api/webhooks/resend`. Only a brand-new sender triggers the
full multi-channel `notifyNewLead()` blast; replies use a narrower
single-channel reply path (`handleReply()` in that route, structurally the
same shape as the SMS webhook's reply handling).

**Qualifying/closing behavior:** the system prompt doesn't just answer
questions — it asks one focused qualifying question at a time when the
job is still vague, computes a ballpark estimate from a rate/formula in
`ai_context` when there's enough detail to (always framed as non-binding,
pending a real on-site quote — never a firm number), and nudges toward a
concrete next step ("want us to schedule a free on-site quote?") once it's
given a real answer or the customer signals they're ready — without
forcing that onto every single reply.

Cost stays low by design: Haiku 4.5 (not a larger model) at a few hundred
tokens per reply is a small fraction of a cent per lead.

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
