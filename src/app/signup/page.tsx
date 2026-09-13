import Link from "next/link";
import { Mail } from "lucide-react";
import { AuthLayout } from "@/components/auth-layout";

const CONTACT_EMAIL = "faisalkhan682068@gmail.com";

/**
 * SpeedLead is invite-only, not self-serve — accounts are created by a
 * platform admin (see app/admin/*) after payment is handled outside this
 * app. This page used to be a signup form; it's kept at this URL (rather
 * than removed) so old links/bookmarks land somewhere sensible instead of
 * a 404, and so the marketing site can still point somewhere for "I want
 * this."
 */
export default function SignupPage() {
  return (
    <AuthLayout>
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm shadow-slate-200/60">
        <h1 className="text-xl font-bold text-slate-900">SpeedLead is invite-only</h1>
        <p className="mt-2 text-sm text-slate-500">
          Accounts are set up for you after signing on as a client — there&apos;s no self-serve
          signup. Reach out and we&apos;ll get your workspace ready.
        </p>

        <a
          href={`mailto:${CONTACT_EMAIL}?subject=SpeedLead%20-%20interested`}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-600/30 transition hover:bg-brand-700"
        >
          <Mail className="h-4 w-4" />
          Contact us
        </a>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">
            Log in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
