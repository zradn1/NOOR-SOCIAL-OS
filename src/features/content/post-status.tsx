import { Badge, StatusDot, type BadgeTone } from "@/components/ui/badge";

const POST: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  ready: { label: "Ready", tone: "silver" },
  scheduled: { label: "Scheduled", tone: "info" },
  publishing: { label: "Publishing", tone: "info" },
  published: { label: "Published", tone: "success" },
  partially_published: { label: "Partially published", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  simulated: { label: "Simulated · not posted", tone: "demo" },
  archived: { label: "Archived", tone: "neutral" },
};

const TARGET: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Not scheduled", tone: "neutral" },
  scheduled: { label: "Scheduled", tone: "info" },
  queued: { label: "Queued", tone: "info" },
  publishing: { label: "Publishing", tone: "info" },
  published: { label: "Published", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  blocked: { label: "Blocked", tone: "warning" },
  simulated: { label: "Simulated · not posted", tone: "demo" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const JOB: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Waiting", tone: "info" },
  running: { label: "Running", tone: "info" },
  succeeded: { label: "Confirmed by platform", tone: "success" },
  simulated: { label: "Simulated", tone: "demo" },
  blocked: { label: "Blocked", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function PostStatusBadge({ status }: { status: string }) {
  const s = POST[status] ?? { label: status, tone: "neutral" as const };
  return (
    <Badge tone={s.tone}>
      <StatusDot />
      {s.label}
    </Badge>
  );
}

export function TargetStatusBadge({ status }: { status: string }) {
  const s = TARGET[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function JobStatusBadge({ status }: { status: string }) {
  const s = JOB[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
