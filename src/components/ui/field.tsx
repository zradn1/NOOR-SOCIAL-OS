import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function Label({
  htmlFor,
  children,
  className,
  optional,
}: {
  htmlFor?: string;
  children: ReactNode;
  className?: string;
  optional?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className={cn("block text-[13px] font-medium text-fg-secondary", className)}>
      {children}
      {optional ? <span className="ml-1.5 font-normal text-fg-faint">Optional</span> : null}
    </label>
  );
}

/**
 * Field wraps a control with its label, hint, and error. Pass the same `id` to
 * the control and set `aria-describedby={describedBy(id, …)}` on it so assistive
 * technology announces the hint and error.
 */
export function Field({
  id,
  label,
  hint,
  error,
  optional,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | string[];
  optional?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const errorText = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} optional={optional}>
        {label}
      </Label>
      {children}
      {hint && !errorText ? (
        <p id={`${id}-hint`} className="text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
      {errorText ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {errorText}
        </p>
      ) : null}
    </div>
  );
}

export function describedBy(id: string, { hint, error }: { hint?: unknown; error?: unknown }) {
  const ids = [];
  if (error) ids.push(`${id}-error`);
  else if (hint) ids.push(`${id}-hint`);
  return ids.length ? ids.join(" ") : undefined;
}
