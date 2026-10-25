import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie and keeps anonymous visitors out of
 * the app. This is a convenience layer, NOT the security boundary: every page,
 * Server Action, and Route Handler re-verifies the session and permissions.
 */
const PROTECTED_PREFIXES = ["/app", "/w/", "/onboarding", "/admin", "/invite/"];
const AUTH_PAGES = ["/sign-in", "/sign-up"];

/**
 * Reads an environment variable at request time. Literal
 * `process.env.NEXT_PUBLIC_*` references are inlined at build time, which would
 * pin this server to the build machine's values and disagree with
 * src/server/env.ts (runtime). Dynamic access keeps one build deployable to
 * any environment.
 */
function runtimeEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

export async function proxy(request: NextRequest) {
  const url = runtimeEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = runtimeEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?? runtimeEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const { pathname, search } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p));

  if (!url || !key) {
    // Without Supabase configuration nobody can be signed in.
    if (isProtected) return NextResponse.redirect(new URL("/sign-in?error=not-configured", request.url));
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [header, value] of Object.entries(headers ?? {})) response.headers.set(header, value);
      },
    },
  });

  // Verifies the JWT (refreshing it if needed) before anything else runs.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  if (!signedIn && isProtected) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(signIn);
  }
  if (signedIn && AUTH_PAGES.includes(pathname)) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets, images, and API routes (which
    // authenticate themselves: webhooks, cron, OAuth callbacks).
    "/((?!_next/static|_next/image|api/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
