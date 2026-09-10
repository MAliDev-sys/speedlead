import { z } from "zod";

/**
 * Centralized, validated environment access.
 *
 * Integrations degrade gracefully when their keys are missing (see
 * lib/notify/*) so you can build the dashboard UI before every third-party
 * account is wired up. Only the Supabase vars are required to boot at all.
 */
const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(), // e.g. "whatsapp:+14155238886"

  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(), // e.g. "SpeedLead <leads@mail.speedlead.io>"

  // Powers the AI auto-responder (see lib/ai-respond.ts). Optional — orgs
  // with auto_respond_mode='ai' fall back to a fixed template when unset.
  ANTHROPIC_API_KEY: z.string().optional(),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  CRON_SECRET: z.string().optional(),

  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function getEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      "Invalid/missing environment variables:",
      parsed.error.flatten().fieldErrors
    );
    throw new Error(
      "Missing required environment variables — see .env.example. " +
        "At minimum NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY " +
        "and SUPABASE_SERVICE_ROLE_KEY must be set."
    );
  }
  cached = parsed.data;
  return cached;
}

/** True once the Twilio SMS/voice integration has credentials configured. */
export function hasTwilio(env: ServerEnv = getEnv()) {
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN);
}

export function hasResend(env: ServerEnv = getEnv()) {
  return Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL);
}

export function hasStripe(env: ServerEnv = getEnv()) {
  return Boolean(env.STRIPE_SECRET_KEY);
}

export function hasAnthropic(env: ServerEnv = getEnv()) {
  return Boolean(env.ANTHROPIC_API_KEY);
}
