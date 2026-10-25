import { AlertTriangle, CheckCircle2, CircleSlash, FlaskConical, Hand, Hourglass, OctagonAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SocialAccountView } from "@/server/services/social-accounts";

const STATUS: Record<
  SocialAccountView["status"],
  { label: string; tone: "demo" | "silver" | "success" | "info" | "warning" | "neutral" | "danger"; icon: typeof CheckCircle2; help: string }
> = {
  demo: {
    label: "Demo · simulated",
    tone: "demo",
    icon: FlaskConical,
    help: "A simulated account in a demo workspace. It is not connected to any platform.",
  },
  manual: {
    label: "Manual · not connected",
    tone: "silver",
    icon: Hand,
    help: "Tracked by hand for imported analytics. No credentials are stored and it cannot publish.",
  },
  pending: { label: "Pending verification", tone: "info", icon: Hourglass, help: "Authorization started but not completed." },
  connected: {
    label: "Connected",
    tone: "success",
    icon: CheckCircle2,
    help: "Verified by the platform through its official authorization.",
  },
  expired: { label: "Reconnect needed", tone: "warning", icon: AlertTriangle, help: "The platform token expired and couldn't be refreshed." },
  revoked: { label: "Access revoked", tone: "neutral", icon: CircleSlash, help: "Access was revoked on the platform." },
  error: { label: "Error", tone: "danger", icon: OctagonAlert, help: "The last sync failed. See the error for details." },
  disconnected: { label: "Disconnected", tone: "neutral", icon: CircleSlash, help: "Disconnected. Stored tokens were erased." },
};

export function ConnectionStatusBadge({ status }: { status: SocialAccountView["status"] }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <Badge tone={s.tone === "neutral" ? "neutral" : s.tone} title={s.help}>
      <Icon aria-hidden="true" />
      {s.label}
    </Badge>
  );
}

export function connectionHelp(status: SocialAccountView["status"]) {
  return STATUS[status].help;
}
