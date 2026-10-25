import type { ActionResult } from "@/server/actions/result";
import { Alert } from "./alert";

/** Top-of-form status for a Server Action result. */
export function FormMessage({ state }: { state: ActionResult<unknown> | null | undefined }) {
  if (!state) return null;
  if (state.ok) {
    return state.message ? <Alert tone="success">{state.message}</Alert> : null;
  }
  if (state.error.code === "VALIDATION" && state.error.fieldErrors) return null;
  return (
    <Alert tone="danger">
      {state.error.message}
      {state.error.reference ? <span className="ml-1 font-mono text-2xs opacity-70">({state.error.reference})</span> : null}
    </Alert>
  );
}

export function fieldError(state: ActionResult<unknown> | null | undefined, field: string) {
  if (!state || state.ok) return undefined;
  return state.error.fieldErrors?.[field]?.[0];
}
