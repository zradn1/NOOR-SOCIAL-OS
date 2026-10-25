"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { loadWorkspaceForAction } from "@/server/auth/context";
import { AppError } from "@/server/errors";
import { requestMeta } from "@/server/security/request";
import { importAccountMetrics } from "@/server/services/analytics-import";
import { runAction } from "./run";

const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/);

export async function importMetricsAction(slug: string, input: { accountId: string; csv: string }) {
  const result = await runAction("analytics.import", async () => {
    const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "analytics.import");
    const parsed = z.object({ accountId: z.uuid(), csv: z.string().max(1_000_000) }).parse(input);
    try {
      return await importAccountMetrics(ctx, parsed, await requestMeta());
    } catch (error) {
      // Row-level problems are safe to show; they only echo the user's file.
      if (error instanceof AppError && Array.isArray(error.details?.errors)) {
        throw new AppError("VALIDATION", `${error.publicMessage} ${(error.details!.errors as string[]).slice(0, 5).join(" ")}`);
      }
      throw error;
    }
  });
  if (result.ok) refresh();
  return result;
}
