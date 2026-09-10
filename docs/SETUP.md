# SpeedLead — Setup Guide

Accounts to create, in order. Everything here has a free tier that's enough
for local dev + your first several customers.

## 1. Supabase (database + auth) — free
1. Create account at https://supabase.com → New Project.
2. Note the project's **Project URL**, **anon public key**, and
   **service_role key** (Project Settings → API).
3. Install the CLI and link it once we have the app running:
   `npm i -g supabase` then `supabase link --project-ref <ref>`.
4. Apply the schema: `supabase db push` (runs everything in
   `supabase/migrations/`).

> **Gotcha — email confirmation rate limits in dev:** Supabase's built-in
> email sender (used for signup confirmation links) is a shared, heavily
> throttled service meant only for quick testing (a handful of emails per
> hour) — it's not meant for real signups and will start throwing "email
> rate limit exceeded" almost immediately once you're testing signup
> repeatedly. For local dev, turn off **Authentication → Sign In /
> Providers → Email → "Confirm email"** so signup logs you in instantly
> with no email sent. Before real customers sign up, replace it with a
> custom SMTP provider under **Authentication → Emails → SMTP Settings**
> — Resend (already in this stack) works well for that.

> **Required for "forgot password" to work:** Supabase's default password-
> reset email links to Supabase's own hosted verify page, which this app
> doesn't handle. Point it at our route instead: **Authentication → Emails
> → Templates → Reset Password**, edit the link/button HTML so its `href`
> is:
> ```
> {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
> ```
> (replacing whatever uses `{{ .ConfirmationURL }}`). See `/auth/confirm`
> (`src/app/auth/confirm/route.ts`) for how that's verified.

## 2. Vercel (hosting) — free Hobby tier
1. Create account at https://vercel.com, connect your GitHub.
2. Import this repo once it's pushed to GitHub; framework auto-detected as
   Next.js.
3. Add the environment variables from `.env.example` in Vercel's project
   settings (Production + Preview).
> Note: Hobby-tier cron jobs only run once/day. For the drip-sequence worker
> we instead use a free external scheduler (see step 6) so it can run every
> minute regardless of plan.

## 3. Twilio (SMS, missed-call capture, WhatsApp) — pay as you go
1. Create account at https://www.twilio.com/try-twilio (free trial credit).
2. Grab **Account SID** and **Auth Token** from the console dashboard.
3. Buy a phone number with SMS + Voice capability (~$1.15/mo) per business
   you onboard — do this from the dashboard's "Buy a number", or later we
   automate it via the Twilio API from the app's admin UI.
4. WhatsApp: enable the Twilio Sandbox for WhatsApp for dev/testing
   (Messaging → Try it out → WhatsApp). For production you'll register a
   WhatsApp Sender with Meta via Twilio (takes a few days for approval) —
   fine to defer until you have a paying customer who needs it.
5. Cost reference: ~$0.0079/SMS segment (US), ~$0.0085/min voice, number
   rental ~$1.15/mo.

## 4. Resend (email) — free tier: 3,000 emails/mo, 1 domain
1. Create account at https://resend.com.
2. Add + verify a sending domain (or use their shared test domain while in
   dev), grab the **API key**.

## 5. Anthropic (AI auto-response, optional) — pay as you go, very cheap
1. Create account at https://console.anthropic.com and add a small amount of
   credit (a few dollars covers thousands of auto-replies — Haiku 4.5 is
   ~$1/$5 per million input/output tokens, and each reply is a few hundred
   tokens).
2. Create an API key at https://console.anthropic.com/settings/keys.
3. Only needed if a business turns on "AI-generated reply" under Settings →
   Integrations → Auto-response (see docs/ARCHITECTURE.md). Every org
   defaults to the free fixed-template reply, so you can skip this step
   entirely for local dev/QA and add it later.

## 6. Slack (team notifications) — free
1. Create a Slack App at https://api.slack.com/apps → "From scratch".
2. Add the `chat:write` and `incoming-webhook` scopes, install to your own
   workspace for dev.
3. For the real product, each *customer* installs the Slack app to their own
   workspace via OAuth ("Add to Slack" button in the dashboard) — this needs
   the app submitted for distribution later; for the first customers, manual
   incoming-webhook URLs per org are a fine shortcut.

## 7. Free cron trigger for the follow-up worker
Pick one (both are free):
- **cron-job.org** — create a job that hits
  `https://<your-domain>/api/cron/process-jobs` every 1–5 minutes with a
  `Authorization: Bearer <CRON_SECRET>` header.
- **GitHub Actions** scheduled workflow in this repo (see
  `.github/workflows/cron.yml` once added) — `schedule: cron: '*/5 * * * *'`.

## 8. Stripe (billing) — add once you have a pricing page ready
1. Create account at https://stripe.com, get **publishable** + **secret**
   keys (test mode first).
2. Create Products/Prices for your plans (e.g. Starter/Pro/Scale).
3. Add a webhook endpoint → `/api/webhooks/stripe`, subscribe to
   `checkout.session.completed`, `customer.subscription.updated/deleted`.

## Environment variables
Copy `.env.example` to `.env.local` and fill in the values collected above.

## Local development
```bash
npm install
npm run dev
```
The app expects Supabase migrations already applied (step 1.4) and at least
the Supabase env vars set to boot; other integrations degrade gracefully
(logged, not sent) if their keys are missing, so you can develop the UI
before every account is wired up.
