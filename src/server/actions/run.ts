import "server-only";
import { randomUUID } from "node:crypto";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { AppError, toAppError } from "@/server/errors";
import { logger } from "@/server/observability/logger";
import type { ActionResult } from "./result";

export class ValidationError extends AppError {
  constructor(public readonly fieldErrors: Record<string, string[] | undefined>) {
    super("VALIDATION", "Please check the highlighted fields.");
  }
}

/** Validates untrusted input (FormData or a plain object) against a Zod schema. */
export function parseInput<S extends z.ZodType>(schema: S, input: FormData | Record<string, unknown>): z.infer<S> {
  const raw = input instanceof FormData ? formDataToObject(input) : input;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>);
  }
  return parsed.data;
}

/** Repeated keys become arrays; File entries are kept as-is. */
export function formDataToObject(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(form.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const values = form.getAll(key);
    out[key] = values.length > 1 || key.endsWith("[]") ? values : values[0];
  }
  return out;
}

/**
 * Executes an action body and converts failures into a safe ActionResult.
 * Next.js navigation signals (redirect, notFound) are re-thrown untouched.
 */
export async function runAction<T>(name: string, fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ValidationError) {
      return { ok: false, error: { code: "VALIDATION", message: error.publicMessage, fieldErrors: error.fieldErrors } };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "VALIDATION", message: "That request isn't valid." } };
    }
    const appError = toAppError(error);
    if (appError.code === "INTERNAL") {
      const reference = randomUUID().slice(0, 8);
      logger.error("action.failed", { action: name, reference, error });
      return { ok: false, error: { code: "INTERNAL", message: appError.publicMessage, reference } };
    }
    return { ok: false, error: { code: appError.code, message: appError.publicMessage } };
  }
}
