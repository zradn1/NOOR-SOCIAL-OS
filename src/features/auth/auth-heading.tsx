import type { ReactNode } from "react";

export function AuthHeading({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="space-y-2">
      <h1 className="font-display text-[2rem] leading-tight text-fg">{title}</h1>
      {description ? <p className="text-sm leading-relaxed text-fg-muted">{description}</p> : null}
    </div>
  );
}
