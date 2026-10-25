import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PLATFORM_META } from "@/lib/platforms/registry";
import { formatRelative } from "@/lib/utils/format";
import { requirePlatformAdmin } from "@/server/admin/access";
import { adminOverview, systemHealth } from "@/server/services/admin";

export const metadata: Metadata = { title: "Overview" };

const CONFIG_LABEL: Record<string, string> = {
  supabaseAuth: "Supabase Auth",
  supabaseServiceRole: "Service role key (server only)",
  database: "Database connection",
  tokenEncryption: "Token encryption keys",
  ipHashing: "IP hashing secret",
  cron: "Cron secret",
  ai: "AI provider key",
  billing: "Stripe billing",
  demoMode: "Demo mode enabled",
};

function Check({ ok, label, detail }: { ok: boolean | "partial"; label: string; detail?: string }) {
  const Icon = ok === true ? CheckCircle2 : ok === "partial" ? CircleDashed : XCircle;
  return (
    <li className="flex items-start gap-2.5 py-2">
      <Icon aria-hidden="true" className={ok === true ? "mt-0.5 size-4 text-success" : ok === "partial" ? "mt-0.5 size-4 text-warning" : "mt-0.5 size-4 text-fg-faint"} />
      <span className="min-w-0">
        <span className="block text-[13px] text-fg">
          {label}
          <span className="sr-only">: {ok === true ? "ok" : ok === "partial" ? "partial" : "not configured"}</span>
        </span>
        {detail ? <span className="block text-xs text-fg-muted">{detail}</span> : null}
      </span>
    </li>
  );
}

export default async function AdminOverviewPage() {
  await requirePlatformAdmin();
  const [overview, health] = await Promise.all([adminOverview(), systemHealth()]);
  const now = new Date();
  const worker = health.heartbeats.find((h) => h.component === "publishing-worker");
  const workerAge = worker ? now.getTime() - Date.parse(worker.lastSeenAt) : null;
  const jobs = Object.fromEntries(overview.jobs.map((j) => [j.status, j.n]));
  const tiles = [
    { label: "Users", value: overview.users, note: overview.suspended ? `${overview.suspended} suspended` : null },
    { label: "Organizations", value: overview.organizations, note: null },
    { label: "Workspaces", value: overview.workspaces, note: `${overview.demoWorkspaces} demo, isolated` },
    { label: "AI generations this month", value: overview.aiGenerationsThisMonth, note: "model calls only" },
  ];

  return (
    <div className="space-y-8">
      <PageHeader title="Platform overview" description="Live counts from the database. Demo data is counted separately and never mixed into real totals." />

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <li key={t.label}>
            <Card className="h-full p-5">
              <p className="text-xs text-fg-muted">{t.label}</p>
              <p className="mt-1 font-display text-3xl tabular-nums text-fg">{t.value.toLocaleString()}</p>
              {t.note ? <p className="mt-1 text-xs text-fg-faint">{t.note}</p> : null}
            </Card>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="System health" />
          <CardContent>
            <ul className="divide-y divide-line">
              <Check ok={health.database.ok} label="Database" detail={health.database.ok ? `${health.database.latencyMs} ms round trip` : health.database.error} />
              <Check
                ok={worker ? (workerAge! < 5 * 60_000 ? true : "partial") : false}
                label="Publishing worker"
                detail={worker ? `Last run ${formatRelative(worker.lastSeenAt, now)}` : "No worker or cron run recorded yet"}
              />
              <Check
                ok={health.queue ? (health.queue.overdue === 0 ? true : "partial") : false}
                label="Publishing queue"
                detail={health.queue ? `${health.queue.due} due · ${health.queue.overdue} overdue (10+ min) · ${health.queue.running} running` : "Unavailable"}
              />
              <Check
                ok={health.ai.mode === "anthropic" ? true : health.ai.mode === "demo" ? "partial" : false}
                label="AI assistant"
                detail={health.ai.mode === "anthropic" ? `Claude · ${health.ai.model}` : health.ai.mode === "demo" ? "Demo templates (no model)" : health.ai.reason}
              />
              <Check
                ok={health.billing.mode === "stripe" ? true : false}
                label="Billing"
                detail={health.billing.mode === "stripe" ? "Stripe" : health.billing.reason === "missing_keys" ? `Missing ${health.billing.missing.join(", ")}` : "Disabled"}
              />
              <Check ok={overview.failedBillingEvents === 0} label="Billing webhooks" detail={`${overview.failedBillingEvents} failed event${overview.failedBillingEvents === 1 ? "" : "s"} awaiting retry`} />
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Configuration" description="Presence only; values are never shown." />
          <CardContent>
            <ul className="divide-y divide-line">
              {Object.entries(health.configuration).map(([key, ok]) => (
                <Check key={key} ok={Boolean(ok)} label={CONFIG_LABEL[key] ?? key} />
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Social integrations" description="Official API integrations. None publish in this build." />
          <CardContent>
            <ul className="divide-y divide-line">
              {health.integrations.map((s) => (
                <Check
                  key={s.platform}
                  ok={s.implemented && s.configured ? true : s.configured ? "partial" : false}
                  label={PLATFORM_META[s.platform].name}
                  detail={s.implemented ? (s.configured ? "Ready" : `Missing ${s.missingConfig.join(", ")}`) : `Not implemented${s.configured ? " (credentials present)" : ""}`}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Subscriptions" description="By plan, status, and how they're billed" />
          <CardContent>
            <ul className="space-y-2 text-[13px]">
              {overview.plans.map((p) => (
                <li key={`${p.planId}-${p.status}-${p.provider}`} className="flex items-center justify-between gap-3">
                  <span className="text-fg-secondary">
                    {p.planId} <span className="text-fg-faint">· {p.status} · {p.provider}</span>
                  </span>
                  <span className="tabular-nums text-fg">{p.n}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Social accounts" description="By connection state" />
          <CardContent>
            <ul className="space-y-2 text-[13px]">
              {overview.accounts.length === 0 ? <li className="text-fg-muted">None yet.</li> : null}
              {overview.accounts.map((a) => (
                <li key={a.status} className="flex items-center justify-between gap-3">
                  <span className="text-fg-secondary">{a.status === "demo" ? <Badge tone="demo">demo</Badge> : a.status}</span>
                  <span className="tabular-nums text-fg">{a.n}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Publishing jobs" description="Updated in the last 7 days" />
          <CardContent>
            <ul className="space-y-2 text-[13px]">
              {["pending", "running", "succeeded", "simulated", "blocked", "failed", "cancelled"].map((s) => (
                <li key={s} className="flex items-center justify-between gap-3">
                  <span className={s === "failed" || s === "blocked" ? "text-warning" : "text-fg-secondary"}>{s}</span>
                  <span className="tabular-nums text-fg">{jobs[s] ?? 0}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
