import { cn } from "@/lib/utils/cn";

function initials(name: string) {
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

/** Initials avatar. Remote images are deliberately not loaded here. */
export function Avatar({
  name,
  size = "md",
  className,
  square,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  square?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid shrink-0 place-items-center border border-line-strong bg-gradient-to-b from-surface-hover to-surface-raised font-medium text-silver-100",
        square ? "rounded-md" : "rounded-full",
        size === "sm" && "size-6 text-[10px]",
        size === "md" && "size-8 text-xs",
        size === "lg" && "size-10 text-sm",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
