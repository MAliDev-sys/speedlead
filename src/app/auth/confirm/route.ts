import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Lands here from every Supabase Auth email link — signup confirmation,
 * password recovery, email change, magic link — via the standard
 * `token_hash` + `type` pattern (Supabase's Next.js SSR integration guide's
 * documented approach for handling these server-side with @supabase/ssr).
 *
 * Verifies the token, which establishes a real session (cookies set via
 * the SSR client), then redirects to `next` — for password recovery that's
 * /reset-password (see requestPasswordReset in app/auth/actions.ts).
 *
 * Requires the corresponding Supabase email template to actually link
 * here instead of Supabase's own hosted verify page — see docs/SETUP.md.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/leads";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("[auth/confirm] verifyOtp failed:", error.message);
  }

  return NextResponse.redirect(`${origin}/login?error=invalid_or_expired_link`);
}
