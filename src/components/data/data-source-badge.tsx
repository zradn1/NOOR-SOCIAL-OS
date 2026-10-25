import { FlaskConical, FileUp, ShieldCheck, CircleSlash, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { DATA_SOURCE_META, freshnessOf, type MetricProvenance } from "@/lib/analytics/data-source";
import { cn } from "@/lib/utils/cn";
import { formatRelative } from "@/lib/utils/format";

const ICONS = {
  demo: FlaskConical,
  manual_import: FileUp,
  provider_sync: ShieldCheck,
  unavailable: CircleSlash,
  mixed: Layers,
} as const;

export function DataSourceBadge({ source, className }: { source: MetricProvenance; className?: string }) {
  const meta = DATA_SOURCE_META[source];
  const Icon = ICONS[source];
  return (
    <Tooltip content={meta.description}>
      <Badge tone={meta.tone} className={cn("cursor-help", className)} tabIndex={0}>
        <Icon aria-hidden="true" />
        {meta.label}
      </Badge>
    </Tooltip>
  );
}

const FRESHNESS_STYLE = {
  fresh: { dot: "bg-success", text: "Updated" },
  stale: { dot: "bg-warning", text: "Last updated" },
  outdated: { dot: "bg-danger", text: "Out of date, last updated" },
  never: { dot: "bg-fg-faint", text: "Never synchronized" },
} as const;

export function FreshnessIndicator({
  capturedAt,
  now,
  className,
}: {
  capturedAt: Date | string | null;
  now: Date;
  className?: string;
}) {
  const freshness = freshnessOf(capturedAt, now);
  const style = FRESHNESS_STYLE[freshness];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-fg-muted", className)}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", style.dot)} />
      {style.text}
      {capturedAt ? ` ${formatRelative(capturedAt, now)}` : null}
    </span>
  );
}
