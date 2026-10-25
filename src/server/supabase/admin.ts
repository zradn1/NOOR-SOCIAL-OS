import "server-only";
import { createClient } from "@supabase/supabase-js";
import { ConfigurationError, env, supabaseConfig } from "@/server/env";

/**
 * Service-role client for Auth administration and Storage signing. Bypasses
 * RLS — call only after server-side authorization. Never import from client code.
 */
export function createSupabaseAdminClient() {
  const { url } = supabaseConfig();
  const serviceKey = env().SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new ConfigurationError(["SUPABASE_SERVICE_ROLE_KEY"]);
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
