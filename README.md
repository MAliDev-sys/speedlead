# SpeedLead

A multi-tenant "speed-to-lead" SaaS for local US service businesses (HVAC,
plumbing, electrical, roofing, …). The moment a lead comes in — website
form, Zapier/Google LSA/Facebook webhook, or a missed call — it instantly
texts, emails, Slack-alerts the team, and (optionally) messages via
WhatsApp, then runs a follow-up drip sequence until a human takes over.

- **Product/architecture overview:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Accounts to create + local setup:** [docs/SETUP.md](docs/SETUP.md)

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in Supabase keys at minimum — see docs/SETUP.md
supabase db push             # applies supabase/migrations/0001_init.sql
npm run dev
```

## Stack

Next.js 16 (App Router, one codebase for frontend + backend) · Supabase
(Postgres + Auth + RLS) · Twilio (SMS, missed-call capture, WhatsApp) ·
Resend (email) · Slack (team alerts) · Stripe (billing, phase 2) — chosen to
keep fixed costs at $0/mo until you have paying tenants. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for why.
