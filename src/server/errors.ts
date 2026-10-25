/**
 * Application errors carry a stable code and a message that is safe to show to
 * the user. Anything else is treated as internal and replaced by a generic
 * message plus a reference id.
 */
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "LIMIT_EXCEEDED"
  | "PLAN_FEATURE"
  | "RATE_LIMITED"
  | "NOT_CONFIGURED"
  | "INTEGRATION_UNAVAILABLE"
  | "INTERNAL";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly publicMessage: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(publicMessage);
    this.name = "AppError";
  }
}

export const forbidden = (message = "You don't have permission to do that.") => new AppError("FORBIDDEN", message);
export const notFound = (message = "We couldn't find that.") => new AppError("NOT_FOUND", message);

const LIMIT_LABELS: Record<string, string> = {
  workspaces: "workspaces",
  members: "team members",
  social_accounts: "social accounts",
  scheduled_posts_per_month: "scheduled posts this month",
  ai_generations_per_month: "AI generations this month",
  organizations: "organizations you can own",
};

const FEATURE_LABELS: Record<string, string> = {
  client_workspaces: "Client workspaces",
  analytics_import: "Analytics import",
  audit_log: "Audit log",
  client_roles: "Client guest access",
};

export function limitExceeded(key: string) {
  return new AppError(
    "LIMIT_EXCEEDED",
    `Your plan's limit for ${LIMIT_LABELS[key] ?? key} has been reached. Upgrade to add more.`,
    { limit: key },
  );
}

const INVALID_MESSAGES: Record<string, string> = {
  invitation: "This invitation is no longer valid.",
  invitation_expired: "This invitation has expired. Ask for a new one.",
  invitation_email_mismatch: "This invitation was sent to a different email address. Sign in with that address to accept it.",
  role: "That role can't be assigned here.",
  workspace: "One of the selected workspaces doesn't belong to this organization.",
  workspace_role: "Choose a workspace role.",
  guest_role: "Client guests can be editors, analysts, or viewers.",
  guest_workspace: "Client guests can only join client workspaces.",
  ttl: "Choose an expiry between 1 hour and 30 days.",
};

const CONFLICT_MESSAGES: Record<string, string> = {
  already_member: "That person is already a member of this organization.",
  demo_workspace_exists: "This organization already has a demo workspace.",
};

/** Maps errors raised by our SQL functions and constraints to AppErrors. */
export function fromDatabaseError(error: unknown): AppError | null {
  const e = error as { code?: string; message?: string; constraint?: string } | null;
  if (!e || typeof e !== "object" || typeof e.code !== "string") return null;
  const message = e.message ?? "";
  if (e.code === "42501") {
    return message === "unauthenticated"
      ? new AppError("UNAUTHENTICATED", "Please sign in again.")
      : forbidden();
  }
  if (e.code === "P0001") {
    const [kind, detail = ""] = message.split(":");
    switch (kind) {
      case "limit_exceeded":
        return limitExceeded(detail);
      case "plan_feature":
        return new AppError("PLAN_FEATURE", `${FEATURE_LABELS[detail] ?? detail} isn't included in your plan.`, {
          feature: detail,
        });
      case "conflict":
        return new AppError("CONFLICT", CONFLICT_MESSAGES[detail] ?? "That conflicts with existing data.");
      case "invalid":
        return new AppError("VALIDATION", INVALID_MESSAGES[detail] ?? "That request isn't valid.");
      case "not_found":
        return notFound();
      case "last_owner":
        return new AppError("CONFLICT", "An organization must keep at least one owner.");
      case "transition":
        return new AppError("CONFLICT", INVALID_MESSAGES[detail] ?? "That change isn't allowed in the current state.");
    }
    return null;
  }
  if (e.code === "23505") return new AppError("CONFLICT", "That already exists.");
  if (e.code === "23503") return new AppError("VALIDATION", "A referenced item no longer exists.");
  if (e.code === "23514") return new AppError("VALIDATION", "Some values are outside the allowed range.");
  return null;
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return fromDatabaseError(error) ?? new AppError("INTERNAL", "Something went wrong. Please try again.");
}
