/**
 * Hand-written types mirroring supabase/migrations/0001_init.sql.
 *
 * Once the project is linked to a real Supabase project, prefer generating
 * these instead: `supabase gen types typescript --linked > src/lib/types/database.ts`
 * Keep this file in sync with the migrations until you do.
 *
 * IMPORTANT: these are declared with `type`, not `interface`. supabase-js
 * checks each table against its internal `GenericTable` constraint (which
 * requires `Row`/`Insert`/`Update` to be assignable to `Record<string,
 * unknown>`) via a conditional-type `extends` check — and TypeScript does
 * NOT consider a plain `interface` assignable to an index-signature type in
 * that position, only object type aliases are. Using `interface` here
 * silently makes every table's Schema resolve to `never`, which breaks
 * `.insert()`/`.update()` typing (they still compile, just with useless
 * `never` parameter types) without any error at the type's own definition.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type MemberRole = "owner" | "admin" | "agent";
export type LeadSourceType = "webhook" | "form" | "missed_call" | "manual" | "api";
export type LeadStatus =
  | "new"
  | "contacted"
  | "responded"
  | "qualified"
  | "won"
  | "lost"
  | "spam";
export type MessageChannel = "sms" | "email" | "whatsapp" | "slack" | "voice";
export type MessageDirection = "outbound" | "inbound";
export type IntegrationType = "twilio" | "slack" | "resend" | "whatsapp" | "stripe";
export type JobStatus = "pending" | "processing" | "done" | "failed" | "cancelled";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  business_type: string | null;
  timezone: string;
  plan: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string;
  trial_ends_at: string | null;
  alert_email: string | null;
  alert_phone: string | null;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
};

export type OrganizationMember = {
  org_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
};

export type LeadSource = {
  id: string;
  org_id: string;
  type: LeadSourceType;
  name: string;
  public_token: string;
  config: Json;
  is_active: boolean;
  created_at: string;
};

export type Lead = {
  id: string;
  org_id: string;
  source_id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  message: string | null;
  raw_payload: Json;
  status: LeadStatus;
  assigned_to: string | null;
  first_response_at: string | null;
  first_response_channel: string | null;
  first_response_seconds: number | null;
  created_at: string;
  updated_at: string;
};

export type LeadEvent = {
  id: string;
  org_id: string;
  lead_id: string;
  type: string;
  payload: Json;
  created_at: string;
};

export type MessageRow = {
  id: string;
  org_id: string;
  lead_id: string | null;
  channel: MessageChannel;
  direction: MessageDirection;
  to_address: string | null;
  from_address: string | null;
  body: string | null;
  provider_message_id: string | null;
  status: string;
  error: string | null;
  created_at: string;
};

export type Integration = {
  id: string;
  org_id: string;
  type: IntegrationType;
  config: Json;
  status: string;
  created_at: string;
  updated_at: string;
};

export type PhoneNumber = {
  id: string;
  org_id: string;
  twilio_sid: string;
  phone_number: string;
  forwarding_number: string | null;
  ring_timeout_seconds: number;
  created_at: string;
};

export type Sequence = {
  id: string;
  org_id: string;
  name: string;
  is_active: boolean;
  steps: Json;
  created_at: string;
};

export type ScheduledJob = {
  id: string;
  org_id: string;
  lead_id: string | null;
  type: string;
  payload: Json;
  run_at: string;
  status: JobStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
};

// Minimal shape satisfying supabase-js's generic `Database` parameter for
// the tables we query. Row/Insert/Update collapse to the same shape for
// brevity (Postgres defaults still apply on the actual insert); an empty
// `Relationships` tuple is required by postgrest-js's `GenericTable` type
// but unused since we don't do embedded-resource joins through it here
// (organization_members(*) is the one exception, typed with a manual cast).
type Table<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      organizations: Table<Organization>;
      profiles: Table<Profile>;
      organization_members: Table<OrganizationMember>;
      lead_sources: Table<LeadSource>;
      leads: Table<Lead>;
      lead_events: Table<LeadEvent>;
      messages: Table<MessageRow>;
      integrations: Table<Integration>;
      phone_numbers: Table<PhoneNumber>;
      sequences: Table<Sequence>;
      scheduled_jobs: Table<ScheduledJob>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      member_role: MemberRole;
      lead_source_type: LeadSourceType;
      lead_status: LeadStatus;
      message_channel: MessageChannel;
      message_direction: MessageDirection;
      integration_type: IntegrationType;
      job_status: JobStatus;
    };
  };
};
