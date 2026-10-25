import "server-only";
import { env } from "@/server/env";
import { parseKeyRing } from "@/server/integrations/token-crypto";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import type { WorkerDeps } from "./worker";

/** Production dependencies for the worker and cron entry points. */
export function productionWorkerDeps(): WorkerDeps {
  return {
    keyRing: () => parseKeyRing(env().TOKEN_ENCRYPTION_KEYS, env().TOKEN_ENCRYPTION_ACTIVE_KEY_ID),
    storageUrl: env().SUPABASE_SERVICE_ROLE_KEY
      ? async (bucket, path) => {
          // Platforms fetch media server-side; give them a short-lived link.
          const { data, error } = await createSupabaseAdminClient().storage.from(bucket).createSignedUrl(path, 60 * 60);
          if (error || !data) throw new Error("Couldn't sign the media URL");
          return data.signedUrl;
        }
      : undefined,
  };
}
