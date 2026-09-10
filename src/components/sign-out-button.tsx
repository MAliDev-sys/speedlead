"use client";

import { signOut } from "@/app/auth/actions";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut()}
      className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
    >
      Sign out
    </button>
  );
}
