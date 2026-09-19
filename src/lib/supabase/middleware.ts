import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Skip auth checks if Supabase is not configured (e.g., during build)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Verify the session locally against the project's published signing key
  // (ES256 JWKS) instead of round-tripping to the auth server on every
  // request. getClaims() still refreshes an expired token via the cookie
  // flow above, so Server Components keep seeing a live session.
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = !claimsError && claims?.claims?.sub ? claims.claims.sub : null;
  const user = userId ? { id: userId } : null;

  // Public routes that don't require auth
  const pathname = request.nextUrl.pathname;
  // Shared recipe pages (/r/<token>) are readable signed-out; saving from
  // one goes through an authenticated API route.
  const isPublicRoute =
    pathname === "/login" || pathname === "/signup" || pathname.startsWith("/auth/") || pathname.startsWith("/r/");
  const currentPath = request.nextUrl.pathname + request.nextUrl.search;

  if (!user && !isPublicRoute) {
    // API callers get a proper 401 instead of a redirect to HTML
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", currentPath);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  if (user && !isPublicRoute && !pathname.startsWith("/api/")) {
    const hasHousehold = request.cookies.get("platemate-has-household")?.value === "1";

    if (!hasHousehold) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("active_household_id")
        .eq("id", user.id)
        .single();

      if (!profile?.active_household_id) {
        const url = request.nextUrl.clone();
        url.pathname = "/signup";
        url.search = "";
        url.searchParams.set("step", "household");
        if (pathname !== "/") url.searchParams.set("next", currentPath);
        return NextResponse.redirect(url);
      }

      supabaseResponse.cookies.set("platemate-has-household", "1", {
        path: "/",
        maxAge: 60 * 60 * 24,
        httpOnly: true,
        sameSite: "lax",
      });
    }
  }

  return supabaseResponse;
}
