"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEnv } from "@/lib/env";

export async function signIn(_prevState: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/leads");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect(next);
}

export async function signUp(_prevState: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) return { error: error.message };

  if (data.user) {
    await supabase.from("profiles").upsert({
      id: data.user.id,
      email,
      full_name: fullName,
    });
  }

  // If email confirmation is required, there's no session yet.
  if (!data.session) {
    return { message: "Check your email to confirm your account, then log in." };
  }

  redirect("/onboarding");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Sends a password-reset email. Always returns the same generic message
 * regardless of whether the address has an account — otherwise the
 * response itself would let someone enumerate which emails are
 * registered. The link points at /auth/confirm (see that route), which
 * verifies the token and establishes a recovery session before handing
 * off to /reset-password.
 *
 * Requires the Supabase project's "Reset Password" email template to
 * link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
 * — see docs/SETUP.md.
 */
export async function requestPasswordReset(_prevState: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getEnv().NEXT_PUBLIC_APP_URL}/auth/confirm?next=/reset-password`,
  });
  if (error) {
    console.error("[auth] resetPasswordForEmail failed:", error.message);
  }

  return { message: "If an account exists for that email, a reset link is on its way." };
}

/**
 * Sets a new password. Only works within an active recovery session
 * (established by /auth/confirm after the user clicks the emailed link)
 * — supabase.auth.getUser() returning no user here means the link was
 * missing, already used, or expired.
 */
export async function updatePassword(_prevState: unknown, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "This reset link has expired or was already used. Request a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  redirect("/leads");
}
