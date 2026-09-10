import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { getEnv } from "@/lib/env";

/**
 * Service-role Supabase client. BYPASSES Row Level Security entirely.
 *
 * Only ever import this from server-only code that is not acting on behalf
 * of a logged-in browser session — webhook handlers (Twilio/Slack/Stripe/
 * public lead intake) and the cron worker, which need to write across
 * tenants without a user session. The `server-only` import above makes
 * accidentally bundling this into client code a build-time error.
 */
export function createAdminClient() {
  const env = getEnv();
  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
