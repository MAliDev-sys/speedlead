import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next.js 16 renamed `middleware.ts`/`export function middleware` to
// `proxy.ts`/`export function proxy` (network-boundary code only now runs
// on the Node.js runtime, not Edge). This refreshes the Supabase auth
// session cookie on every request and gates the authenticated dashboard.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthRoute =
    path.startsWith("/login") || path.startsWith("/signup") || path.startsWith("/forgot-password");
  const isPublicRoute =
    isAuthRoute ||
    path === "/" ||
    path.startsWith("/api/") ||
    path.startsWith("/widget.js") ||
    path.startsWith("/_next") ||
    // /auth/confirm verifies the emailed token_hash and establishes the
    // session itself — there is no session yet on that first request, so
    // it must stay public or the redirect-to-login below fires first and
    // the link never gets a chance to verify. Also covers /reset-password
    // so someone can land there straight from the email a moment before
    // /auth/confirm's redirect finishes setting the recovery session.
    path.startsWith("/auth/") ||
    path.startsWith("/reset-password");

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/leads";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets, so the session cookie stays
     * fresh across the whole app; webhook/API routes are excluded from the
     * auth *redirect* logic above (they use their own signature checks),
     * but still pass through here.
     */
    "/((?!_next/static|_next/image|favicon.ico|widget.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
