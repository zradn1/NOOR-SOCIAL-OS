import { AlertTriangle, Check, CheckCircle2, Clock, Minus, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { AccessDenied } from "@/components/shell/access-denied";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CheckoutButton, PortalButton } from "@/features/billing/plan-actions";
import { cn } from "@/lib/utils/cn";
import { formatRelative } from "@/lib/utils/format";
import { permits, requireWorkspace } from "@/server/auth/context";
import type { SubscriptionStatus } from "@/server/billing";
import { getBillingOverview, type PlanSummary } from "@/server/services/billing";

export const metadata: Metadata = { title: "Billing" };

const STATUS: Record<SubscriptionStatus, { label: string; tone: BadgeTone; icon: typeof Check }> = {
  active: { label: "Active", tone: "success", icon: CheckCircle2 },
  trialing: { label: "Trial", tone: "info", icon: Clock },
  past_due: { label: "Payment overdue", tone: "warning", icon: AlertTriangle },
  unpaid: { label: "Unpaid", tone: "danger", icon: XCircle },
  canceled: { label: "Canceled", tone: "neutral", icon: Minus },
  incomplete: { label: "Awaiting payment", tone: "warning", icon: Clock },
  incomplete_expired: { label: "Expired", tone: "neutral", icon: Minus },
  paused: { label: "Paused", tone: "neutral", icon: Minus },
};

const LIMIT_ROWS: { key: string; label: string; unit?: string }[] = [
  { key: "workspaces", label: "Workspaces" },
  { key: "social_accounts", label: "Social accounts" },
  { key: "members", label: "Team members" },
  { key: "scheduled_posts_per_month", label: "Scheduled posts / month" },
  { key: "ai_generations_per_month", label: "AI generations / month" },
  { key: "analytics_history_days", label: "Analytics history", unit: "days" },
];

const FEATURE_ROWS: { key: string; label: string }[] = [
  { key: "analytics_import", label: "Analytics import" },
  { key: "client_workspaces", label: "Client workspaces" },
  { key: "audit_log", label: "Audit log" },
  { key: "client_roles", label: "Client guest access" },
];

const USAGE_LABEL: Record<string, string> = {
  workspaces: "Workspaces",
  social_accounts: "Social accounts",
  members: "Team members",
  scheduled_posts_per_month: "Scheduled posts this month",
  ai_generations_per_month: "AI generations this month",
};

function price(plan: Pick<PlanSummary, "priceCents" | "currency">) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: plan.currency, maximumFractionDigits: 0 }).format(plan.priceCents / 100);
}

export default async function BillingPage({ params, searchParams }: PageProps<"/w/[workspace]/billing">) {
  const { workspace } = await params;
  const query = await searchParams;
  const ctx = await requireWorkspace(workspace);
  if (!permits(ctx, "org.billing.view")) {
    return (
      <div className="space-y-8">
        <PageHeader title="Billing" />
        <AccessDenied permission="org.billing.view" what="billing" />
      </div>
    );
  }

  const { plans, subscription, usage, events, status } = await getBillingOverview(ctx);
  const now = new Date();
  const canManage = permits(ctx, "org.billing.manage");
  const current = plans.find((p) => p.id === subscription.planId) ?? plans[0]!;
  const statusMeta = STATUS[subscription.status];
  const online = status.mode === "stripe";
  const checkout = query.checkout === "submitted" ? "submitted" : query.checkout === "cancelled" ? "cancelled" : null;
  const confirmedRecently =
    subscription.provider === "stripe" &&
    subscription.lastEventAt !== null &&
    now.getTime() - Date.parse(subscription.lastEventAt) < 15 * 60_000 &&
    (subscription.status === "active" || subscription.status === "trialing");
  const periodEnd = subscription.currentPeriodEnd
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: ctx.workspace.timezone }).format(new Date(subscription.currentPeriodEnd))
    : null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={ctx.organization.name}
        title="Billing"
        description="Your plan, what you've used this month, and payments. Plan changes apply only after the payment provider confirms them."
        actions={canManage && online && subscription.hasCustomer ? <PortalButton slug={ctx.workspace.slug} /> : null}
      />

      {checkout === "submitted" ? (
        confirmedRecently ? (
          <Alert tone="success" title={`Stripe confirmed your ${current.name} plan`}>
            The new limits are active for the whole organization.
          </Alert>
        ) : (
          <Alert tone="info" title="Waiting for payment confirmation">
            Your plan changes only after Stripe sends a verified confirmation, usually within a minute. Refresh this page to check; you won&apos;t be charged twice.
          </Alert>
        )
      ) : checkout === "cancelled" ? (
        <Alert tone="neutral" title="Checkout cancelled">
          Nothing was charged and your plan is unchanged.
        </Alert>
      ) : null}

      {!online ? (
        <Alert tone="neutral" title="Online payments aren't configured">
          {status.reason === "missing_keys"
            ? "Stripe is selected but not fully set up on this deployment. Plans can be assigned by a Noor Studio administrator in the meantime."
            : "This deployment has no payment provider. Plans can be assigned by a Noor Studio administrator."}
        </Alert>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader eyebrow="Current plan" title={<span className="font-display text-3xl">{current.name}</span>} description={current.description} />
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusMeta.tone} size="md">
                <statusMeta.icon aria-hidden="true" /> {statusMeta.label}
              </Badge>
              <span className="text-[13px] text-fg-secondary">{current.priceCents ? `${price(current)} / month` : "No charge"}</span>
            </div>
            <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
              <div>
                <dt className="text-xs text-fg-muted">Billed through</dt>
                <dd className="text-fg">
                  {subscription.provider === "stripe" ? "Stripe" : subscription.provider === "manual" ? "Noor Studio (manual)" : "Not billed"}
                </dd>
              </div>
              {periodEnd ? (
                <div>
                  <dt className="text-xs text-fg-muted">{subscription.cancelAtPeriodEnd ? "Ends" : "Renews"}</dt>
                  <dd className="text-fg">{periodEnd}</dd>
                </div>
              ) : null}
            </dl>
            {subscription.cancelAtPeriodEnd ? (
              <p className="text-xs text-warning">Cancels at the end of the period, then moves to Free.</p>
            ) : null}
            {subscription.status === "past_due" || subscription.status === "unpaid" ? (
              <p className="text-xs text-warning">A payment failed. Update the payment method to keep paid features.</p>
            ) : null}
            {subscription.lastEventAt ? (
              <p className="text-xs text-fg-faint">Last confirmed by the provider {formatRelative(subscription.lastEventAt, now)}.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Usage" description="Counted on the server; demo data never counts. Monthly counts reset on the 1st (UTC)." />
          <CardContent>
            <ul className="space-y-4">
              {usage.map((line) => {
                const ratio = line.limit === null ? 0 : line.limit === 0 ? 1 : Math.min(1, line.used / line.limit);
                const tone =
                  line.limit !== null && line.used > line.limit ? "over" : line.limit !== null && line.used >= line.limit ? "danger" : ratio >= 0.8 ? "warning" : "ok";
                return (
                  <li key={line.key}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="text-fg-secondary">{USAGE_LABEL[line.key] ?? line.key}</span>
                      <span className="tabular-nums text-fg">
                        {line.used.toLocaleString()}
                        <span className="text-fg-muted"> / {line.limit === null ? "unlimited" : line.limit.toLocaleString()}</span>
                        {tone === "over" ? (
                          <span className="ml-2 text-xs text-danger">Over limit · new ones are blocked</span>
                        ) : tone === "danger" ? (
                          <span className="ml-2 text-xs text-danger">Limit reached</span>
                        ) : tone === "warning" ? (
                          <span className="ml-2 text-xs text-warning">Almost full</span>
                        ) : null}
                      </span>
                    </div>
                    <div
                      role="meter"
                      aria-label={USAGE_LABEL[line.key] ?? line.key}
                      aria-valuemin={0}
                      aria-valuemax={line.limit ?? undefined}
                      aria-valuenow={line.used}
                      aria-valuetext={line.limit === null ? `${line.used}, unlimited` : `${line.used} of ${line.limit}`}
                      className="h-1.5 overflow-hidden rounded-full bg-surface-raised"
                    >
                      <div
                        className={cn("h-full rounded-full", tone === "danger" || tone === "over" ? "bg-danger" : tone === "warning" ? "bg-warning" : "bg-silver-300")}
                        style={{ width: `${line.limit === null ? 0 : Math.max(ratio * 100, line.used > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="plans-heading" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="plans-heading" className="text-[15px] font-medium text-fg">
            Plans
          </h2>
          {!canManage ? <p className="text-xs text-fg-muted">Only organization owners can change the plan.</p> : null}
        </div>
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          {plans.map((plan) => {
            const isCurrent = plan.id === current.id;
            const priceReady = status.mode === "stripe" && plan.id !== "free" && status.pricesConfigured[plan.id as "starter" | "pro" | "agency"];
            return (
              <li key={plan.id}>
                <Card className={cn("flex h-full flex-col", isCurrent && "border-gold-400/40")}>
                  <div className="space-y-1 p-5 pb-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-[15px] font-medium text-fg">{plan.name}</h3>
                      {isCurrent ? <Badge tone="gold">Current</Badge> : null}
                    </div>
                    <p className="font-display text-3xl text-fg">
                      {price(plan)}
                      <span className="ml-1 font-sans text-xs text-fg-muted">/ month</span>
                    </p>
                    <p className="text-xs leading-relaxed text-fg-muted">{plan.description}</p>
                  </div>
                  <dl className="space-y-2 border-t border-line px-5 py-4 text-[13px]">
                    {LIMIT_ROWS.map((row) => {
                      const value = plan.limits[row.key];
                      return (
                        <div key={row.key} className="flex justify-between gap-3">
                          <dt className="text-fg-muted">{row.label}</dt>
                          <dd className="tabular-nums text-fg">{value === null || value === undefined ? "Unlimited" : `${value.toLocaleString()}${row.unit ? ` ${row.unit}` : ""}`}</dd>
                        </div>
                      );
                    })}
                  </dl>
                  <ul className="space-y-1.5 border-t border-line px-5 py-4 text-[13px]">
                    {FEATURE_ROWS.map((f) => {
                      const has = plan.features.includes(f.key);
                      return (
                        <li key={f.key} className={cn("flex items-center gap-2", has ? "text-fg-secondary" : "text-fg-faint")}>
                          {has ? <Check aria-hidden="true" className="size-3.5 text-success" /> : <Minus aria-hidden="true" className="size-3.5" />}
                          <span>
                            {f.label}
                            <span className="sr-only">{has ? " included" : " not included"}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-auto p-5 pt-0">
                    {isCurrent ? null : !canManage ? null : subscription.provider === "manual" ? (
                      <p className="text-xs text-fg-muted">Managed by Noor Studio.</p>
                    ) : subscription.hasSubscription && online ? (
                      <PortalButton slug={ctx.workspace.slug} label={plan.id === "free" ? "Cancel in portal" : "Change in portal"} variant="ghost" />
                    ) : plan.id === "free" ? null : priceReady ? (
                      <CheckoutButton slug={ctx.workspace.slug} planId={plan.id} label={`Choose ${plan.name}`} />
                    ) : (
                      <p className="text-xs text-fg-muted">Online checkout isn&apos;t available for this plan yet.</p>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      {events.length ? (
        <Card>
          <CardHeader title="Payment provider events" description="Verified webhook deliveries for this organization. Payloads aren't stored." />
          <Table className="mt-4">
            <THead>
              <tr>
                <TH>Event</TH>
                <TH>Result</TH>
                <TH className="text-right">Received</TH>
              </tr>
            </THead>
            <TBody>
              {events.map((e) => (
                <TR key={e.id}>
                  <TD className="font-mono text-xs">{e.type}</TD>
                  <TD>
                    <Badge tone={e.outcome === "applied" ? "success" : e.outcome === "failed" ? "danger" : "neutral"}>{e.outcome ?? "pending"}</Badge>
                    {e.error ? <span className="ml-2 text-xs text-fg-muted">{e.error}</span> : null}
                  </TD>
                  <TD className="text-right text-xs text-fg-muted">{formatRelative(e.receivedAt, now)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
