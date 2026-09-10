-- SpeedLead: initial multi-tenant schema
-- Design notes:
--  * Every business customer is an "organization" (tenant).
--  * All tenant-scoped tables carry org_id and are protected by Row Level
--    Security so one tenant can never read/write another tenant's rows.
--  * auth.users (Supabase Auth) is the identity table; "profiles" extends it.
--  * "lead_sources" issue an opaque public token used in webhook/embed URLs
--    so we never expose org_id or database ids to the public internet.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Core tenancy
-- ---------------------------------------------------------------------------

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  business_type text, -- 'hvac', 'plumbing', 'roofing', 'general', ...
  timezone text not null default 'America/Chicago',
  plan text not null default 'trial', -- trial | starter | pro | scale
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text not null default 'trialing',
  trial_ends_at timestamptz default (now() + interval '14 days'),
  -- Where internal team alerts go when there's no richer integration
  -- (Slack) configured yet, or as a fallback alongside it.
  alert_email text,
  alert_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create type member_role as enum ('owner', 'admin', 'agent');

create table organization_members (
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role member_role not null default 'agent',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index on organization_members (user_id);

-- ---------------------------------------------------------------------------
-- Lead sources (webhook / embeddable form / missed-call number / manual)
-- ---------------------------------------------------------------------------

create type lead_source_type as enum ('webhook', 'form', 'missed_call', 'manual', 'api');

create table lead_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  type lead_source_type not null,
  name text not null,
  public_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  config jsonb not null default '{}'::jsonb, -- e.g. { "redirect_url": "...", "notify_channels": ["sms","slack"] }
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index on lead_sources (org_id);
create index on lead_sources (public_token);

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------

create type lead_status as enum ('new', 'contacted', 'responded', 'qualified', 'won', 'lost', 'spam');

create table leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  source_id uuid references lead_sources (id) on delete set null,
  name text,
  phone text,
  email text,
  message text,
  raw_payload jsonb not null default '{}'::jsonb,
  status lead_status not null default 'new',
  assigned_to uuid references auth.users (id) on delete set null,
  first_response_at timestamptz,
  first_response_channel text,
  first_response_seconds integer, -- computed at write time: response latency in seconds
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on leads (org_id, created_at desc);
create index on leads (org_id, status);
create index on leads (phone);

-- Timeline of everything that happened to a lead (audit trail + activity feed)
create table lead_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  lead_id uuid not null references leads (id) on delete cascade,
  type text not null, -- created | sms_sent | email_sent | slack_notified | whatsapp_sent | call_missed | status_changed | note | assigned
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index on lead_events (lead_id, created_at);

-- ---------------------------------------------------------------------------
-- Outbound/inbound message log (SMS / email / WhatsApp / Slack)
-- ---------------------------------------------------------------------------

create type message_channel as enum ('sms', 'email', 'whatsapp', 'slack', 'voice');
create type message_direction as enum ('outbound', 'inbound');

create table messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  lead_id uuid references leads (id) on delete cascade,
  channel message_channel not null,
  direction message_direction not null,
  to_address text,
  from_address text,
  body text,
  provider_message_id text,
  status text not null default 'queued', -- queued | sent | delivered | failed | received
  error text,
  created_at timestamptz not null default now()
);

create index on messages (org_id, created_at desc);
create index on messages (lead_id);
create index on messages (provider_message_id);

-- ---------------------------------------------------------------------------
-- Per-tenant integration configuration (Twilio, Slack, Resend, WhatsApp)
-- ---------------------------------------------------------------------------

create type integration_type as enum ('twilio', 'slack', 'resend', 'whatsapp', 'stripe');

create table integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  type integration_type not null,
  -- Secrets (access tokens, auth tokens) are stored in Supabase Vault, not here.
  -- This jsonb only holds non-secret config + a vault secret reference id.
  config jsonb not null default '{}'::jsonb,
  status text not null default 'disconnected', -- disconnected | connected | error
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, type)
);

-- Phone numbers provisioned per org for missed-call capture / SMS
create table phone_numbers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  twilio_sid text not null,
  phone_number text not null,
  forwarding_number text, -- the business's real cell/office number to ring
  ring_timeout_seconds integer not null default 20,
  created_at timestamptz not null default now(),
  unique (phone_number)
);

create index on phone_numbers (org_id);

-- ---------------------------------------------------------------------------
-- Follow-up sequences (drip nurture) + the job queue that executes them
-- ---------------------------------------------------------------------------

create table sequences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  -- steps: [{ "delay_minutes": 15, "channel": "sms", "template": "..." }, ...]
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create type job_status as enum ('pending', 'processing', 'done', 'failed', 'cancelled');

create table scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  lead_id uuid references leads (id) on delete cascade,
  type text not null, -- 'sequence_step', 'reminder', ...
  payload jsonb not null default '{}'::jsonb,
  run_at timestamptz not null,
  status job_status not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

create index on scheduled_jobs (status, run_at);
create index on scheduled_jobs (lead_id);

-- Cancel any pending sequence jobs for a lead once it gets a real response,
-- so we never nurture-text someone who already replied / was marked won.
create or replace function cancel_pending_jobs_on_response() returns trigger as $$
begin
  if new.status is distinct from old.status and new.status in ('responded', 'qualified', 'won', 'lost', 'spam') then
    update scheduled_jobs
      set status = 'cancelled'
      where lead_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_cancel_pending_jobs
  after update on leads
  for each row execute function cancel_pending_jobs_on_response();

-- keep updated_at fresh
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_leads_updated_at before update on leads
  for each row execute function set_updated_at();
create trigger trg_orgs_updated_at before update on organizations
  for each row execute function set_updated_at();
create trigger trg_integrations_updated_at before update on integrations
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table organization_members enable row level security;
alter table lead_sources enable row level security;
alter table leads enable row level security;
alter table lead_events enable row level security;
alter table messages enable row level security;
alter table integrations enable row level security;
alter table phone_numbers enable row level security;
alter table sequences enable row level security;
alter table scheduled_jobs enable row level security;

-- Helper: is the current user a member of org_id?
create or replace function is_org_member(target_org uuid) returns boolean as $$
  select exists (
    select 1 from organization_members
    where org_id = target_org and user_id = auth.uid()
  );
$$ language sql stable security definer;

create policy "members can view their org" on organizations
  for select using (is_org_member(id));
create policy "owners/admins can update their org" on organizations
  for update using (
    exists (select 1 from organization_members
      where org_id = organizations.id and user_id = auth.uid() and role in ('owner','admin'))
  );

create policy "user can view own profile" on profiles for select using (auth.uid() = id);
create policy "user can update own profile" on profiles for update using (auth.uid() = id);
create policy "user can insert own profile" on profiles for insert with check (auth.uid() = id);

create policy "members can view membership rows in their org" on organization_members
  for select using (is_org_member(org_id));

create policy "members can view org lead_sources" on lead_sources
  for select using (is_org_member(org_id));
create policy "admins manage lead_sources" on lead_sources
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));

create policy "members can view org leads" on leads
  for select using (is_org_member(org_id));
create policy "members can modify org leads" on leads
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));

create policy "members can view org lead_events" on lead_events
  for select using (is_org_member(org_id));
create policy "members can insert org lead_events" on lead_events
  for insert with check (is_org_member(org_id));

create policy "members can view org messages" on messages
  for select using (is_org_member(org_id));

create policy "members can view org integrations" on integrations
  for select using (is_org_member(org_id));
create policy "admins manage org integrations" on integrations
  for all using (
    exists (select 1 from organization_members
      where org_id = integrations.org_id and user_id = auth.uid() and role in ('owner','admin'))
  );

create policy "members can view org phone_numbers" on phone_numbers
  for select using (is_org_member(org_id));
create policy "admins manage phone_numbers" on phone_numbers
  for insert with check (
    exists (select 1 from organization_members
      where org_id = phone_numbers.org_id and user_id = auth.uid() and role in ('owner','admin'))
  );
create policy "admins update phone_numbers" on phone_numbers
  for update using (
    exists (select 1 from organization_members
      where org_id = phone_numbers.org_id and user_id = auth.uid() and role in ('owner','admin'))
  );

create policy "members can view org sequences" on sequences
  for select using (is_org_member(org_id));
create policy "admins manage sequences" on sequences
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));

create policy "members can view org scheduled_jobs" on scheduled_jobs
  for select using (is_org_member(org_id));

-- Note: all server-side webhook/notification code uses the Supabase
-- service_role key (via a server-only client), which bypasses RLS by
-- design -- that key must never be exposed to the browser.
