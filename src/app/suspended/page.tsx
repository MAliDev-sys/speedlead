import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";

export default function SuspendedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm shadow-slate-200/60">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <AlertCircle className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-lg font-bold text-slate-900">Access paused</h1>
        <p className="mt-2 text-sm text-slate-500">
          This workspace&apos;s access has been paused. Contact your account manager to reactivate it.
        </p>
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
