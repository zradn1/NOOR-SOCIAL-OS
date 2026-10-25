import type { ErrorCode } from "@/server/errors";

/** Serializable result returned by every Server Action. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: ActionError };

export type ActionError = {
  code: ErrorCode;
  message: string;
  fieldErrors?: Record<string, string[] | undefined>;
  reference?: string;
};

export const initialActionState: ActionResult<unknown> | null = null;
