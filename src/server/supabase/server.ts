import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { authCookieOptions } from "@/lib/security/cookies";
import { env, supabaseConfig } from "@/server/env";

/**
 * Supabase client bound to the request's cookies. Use for Auth only; data
 * access goes through src/server/db with RLS-scoped transactions.
 */
export async function createSupabaseServerClient() {
  // Session verification checks token expiry against the clock, so it must
  // run at request time, never in a prerender or runtime prefetch.
  await connection();
  const { url, key } = supabaseConfig();
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookieOptions: authCookieOptions(env().NEXT_PUBLIC_APP_URL),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot set cookies; the proxy refreshes sessions.
        }
      },
    },
  });
}
