# SpeedLead — Project context

This is a business/product brief, not a technical doc — see `docs/ARCHITECTURE.md`
for the system design and `docs/SETUP.md` for account setup. This file exists so
a new Claude Code session (or a new collaborator) can get oriented on *why*
things are built the way they are, not just what the code does. The code,
migration comments, and git commit messages are the other half of this story —
read those too, they're written to explain reasoning, not just describe changes.

## What this is

SpeedLead is a "speed-to-lead" SaaS: the moment a lead contacts a small local
service business (web form, missed call, or email), the system auto-responds
within seconds — AI-generated or a fixed template — texts back missed calls,
runs a follow-up sequence if the lead goes quiet, and gives the owner a
dashboard with every lead and conversation. The pitch: most small service
businesses lose jobs simply by being too slow to reply — the first business to
respond usually wins the work.

**Target customer:** small, owner-operator US home-services businesses — HVAC,
roofing, plumbing, electrical, pest control, landscaping. Typically 1-15
people, the owner is often the one answering calls/emails personally while
also doing the actual jobs.

**Business model:** monthly subscription, ~$150-400/month depending on tier.
No Stripe — billing is manual: a prospect signs up for a free trial, the
owner (Faisal) handles payment collection personally via Payoneer outside the
app, then manually upgrades that org from `/admin` once paid. This was a
deliberate choice, not a gap — Stripe integration was explicitly descoped.

**Trial model (as of 2026-10-01):** self-serve signup gets a **1-day** free
trial (recently shortened from 7 days — see `supabase/migrations/0007_one_day_trial.sql`).
After it expires, the org is locked out of both the dashboard *and* the actual
lead-response pipeline (AI replies, Slack alerts, follow-ups all stop — see
`isOrgLocked()` in `lib/org.ts`) until the owner manually flips it to
`active`/`pro` from `/admin`. Leads that come in during the locked period are
still recorded, just not auto-responded to, so nothing is lost once upgraded.

## Why things are built the way they are

- **Minimum-cost-first, throughout.** Every vendor choice was picked for a
  free or near-free tier at low volume: Supabase (free Postgres+Auth+RLS),
  Vercel Hobby, Resend free tier + Gmail SMTP fallback (not a paid email
  platform), GitHub Actions for cron (not a paid scheduler), Twilio
  pay-as-you-go. Don't suggest a paid upgrade to any of these without a
  concrete reason tied to real usage hitting a free-tier limit.
- **Guaranteed reply, always.** Every lead-facing message — first touch AND
  follow-up, every channel — must produce *some* reply: AI-generated when
  `auto_respond_mode = 'ai'` and the Anthropic key is configured, a fixed
  fallback template otherwise. This was a real bug once (follow-up replies
  silently went nowhere when AI was off or failed) and is now a hard
  invariant, not just a nice-to-have.
- **Genuinely multi-tenant from day one**, not retrofitted: every org has its
  own users (Supabase Auth + RLS), its own AI context/business details, its
  own leads/messages, its own phone number, and can optionally set its own
  outbound email credentials (`integrations` table, type `'email'`) instead
  of using the platform's shared Gmail/Resend sender.
- **The owner (Faisal) is non-technical on infrastructure concepts** (cron,
  SMTP, DNS) but very hands-on — tests everything personally with real
  emails/texts to real accounts, and reports back exact error text/screenshots
  when something breaks. Explain the "why" in plain terms, not just "do X."
  Always verify fixes with actual tool output (`tsc --noEmit`, `eslint`,
  `npm run build` — redirect to a file and check the real exit code, don't
  trust a piped `tail` which has hidden a real failure before).

## What's deliberately deferred (not gaps — don't "fix" these unprompted)

- **Twilio / SMS / missed-call-text-back is currently parked.** Not because
  of a code problem: the owner's Twilio account was briefly IP-blocked, and
  separately, a phone number bought through a third-party app ("Numero") was
  never actually hosted on Twilio, so it can't receive routed calls/texts at
  all. The fix, if/when revisited, is simplest via the existing self-serve
  "Get a new number" flow in Settings → Integrations (~$1.15/mo, real Twilio
  number, works immediately) — not trying to reuse the Numero number.
- **Stripe billing was never built, on purpose** — manual Payoneer collection
  + admin-panel upgrade is the whole billing system, intentionally.
- **A low-probability Resend webhook duplicate-delivery idempotency gap**
  was identified during an earlier audit and explicitly left unfixed as
  low-priority at current scale.

## Go-to-market context

- Outreach approach is deliberately quality-over-quantity: a curated list
  (~10 well-researched leads/day), not mass cold-email blasts.
- A deep-research pass (saved at
  `reports/Best markets outside USA for speed to lead SaaS.md`) concluded the
  US's weak cold-outreach response rate is more likely an execution problem
  (targeting, copy, sequencing, timing, and differentiation against bundled
  AI-answering features already inside ServiceTitan/Housecall Pro/Jobber)
  than a market problem — every alternative market checked (UK, Canada,
  Australia, UAE/Gulf) already has multiple competitors running the identical
  pitch. If a second market is still wanted, the UK came out ahead of
  Canada/Australia/Gulf on legal and competitive grounds — see that report
  for the full reasoning and sourcing.
- A separate outreach/copywriting brief (timing, subject-line hooks, email
  structure, follow-up cadence) was written for a *different* chat focused
  purely on outreach execution, not engineering — if that thread's output
  gets formalized, it belongs in its own doc, not merged into this one.

## Where to look for more

- `docs/SETUP.md` — step-by-step account setup for every vendor (Supabase,
  Vercel, Twilio, Resend, Gmail SMTP, GitHub Actions cron), including the
  Supabase Auth custom-SMTP gotcha and known migration steps not yet applied.
- `docs/ARCHITECTURE.md` — system design and stack rationale. Note: a couple
  of details there (Next.js version, Stripe as the billing plan) are stale
  relative to what's actually built — trust the code and this file over that
  one where they conflict, or update it while you're in there.
- `supabase/migrations/*.sql` — read these in order; several have long
  explanatory comments about *why* a schema decision was made, not just what
  it does.
- `git log` — commit messages here are written to explain reasoning, not just
  summarize the diff.
