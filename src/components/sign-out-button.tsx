"use client";

import { signOut } from "@/app/auth/actions";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut()}
      className="rounded-full border border-slate-200 px-3.5 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
    >
      Sign out
    </button>
  );
}
