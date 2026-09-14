import Link from "next/link";
import { AlertCircle, Mail } from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";

const CONTACT_EMAIL = "faisalkhan682068@gmail.com";

export default async function SuspendedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const trialExpired = reason === "trial_expired";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm shadow-slate-200/60">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <AlertCircle className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-lg font-bold text-slate-900">
          {trialExpired ? "Your free trial has ended" : "Access paused"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {trialExpired
            ? "Hope it showed you what SpeedLead can do. Upgrade to keep responding to leads in seconds."
            : "This workspace's access has been paused. Contact your account manager to reactivate it."}
        </p>

        {trialExpired ? (
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=SpeedLead%20-%20upgrade%20to%20Pro`}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-600/30 transition hover:bg-brand-700"
          >
            <Mail className="h-4 w-4" />
            Upgrade to Pro
          </a>
        ) : null}

        <div className="mt-6 flex justify-center">
          <SignOutButton />
        </div>
        <p className="mt-4 text-xs text-slate-400">
          <Link href="/" className="underline">
            Back to homepage
          </Link>
        </p>
      </div>
    </main>
  );
}
