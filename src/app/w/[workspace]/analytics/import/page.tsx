import { Hand } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shell/access-denied";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { MetricsImportForm } from "@/features/analytics/import-form";
import { todayIn } from "@/lib/time/zoned";
import { permits, requireWorkspace } from "@/server/auth/context";
import { canImportAnalytics } from "@/server/services/analytics-import";
import { listSocialAccounts } from "@/server/services/social-accounts";

export const metadata: Metadata = { title: "Import metrics" };

export default async function ImportMetricsPage({ params }: PageProps<"/w/[workspace]/analytics/import">) {
  const { workspace } = await params;
  const ctx = await requireWorkspace(workspace);
  const base = `/w/${ctx.workspace.slug}`;
  const header = (
    <PageHeader
      title="Import metrics"
      description="Bring in numbers exported from a platform's own analytics for accounts that aren't connected. Imported data is labelled as such everywhere."
      breadcrumbs={[{ label: "Analytics", href: `${base}/analytics` }, { label: "Import" }]}
    />
  );

  if (!permits(ctx, "analytics.import")) {
    return (
      <div className="space-y-8">
        {header}
        <AccessDenied permission="analytics.import" what="metric imports" />
      </div>
    );
  }
  if (ctx.workspace.isDemo) {
    return (
      <div className="space-y-8">
        {header}
        <Alert tone="demo" title="Demo workspaces hold simulated data only">
          Imports go into a regular workspace so real numbers never mix with demo data.
        </Alert>
      </div>
    );
  }

  const [allowed, accounts] = await Promise.all([canImportAnalytics(ctx), listSocialAccounts(ctx)]);
  const manual = accounts.filter((a) => a.status === "manual");

  return (
    <div className="space-y-8">
      {header}
      {!allowed ? (
        <Alert
          tone="neutral"
          title="Metric imports are part of the Starter plan and above"
          action={
            permits(ctx, "org.billing.view") ? (
              <Button asChild variant="secondary" size="sm">
                <Link href={`${base}/billing`}>See plans</Link>
              </Button>
            ) : null
          }
        >
          Your organization is on a plan without imports. The check also runs on the server, so uploads are refused until the plan changes.
        </Alert>
      ) : manual.length === 0 ? (
        <EmptyState
          icon={Hand}
          title="No manually tracked accounts"
          description="Imports go into accounts you track by hand. Add one on the Social Accounts page, then come back with its CSV export."
          action={
            <Button asChild variant="secondary">
              <Link href={`${base}/accounts`}>Go to Social Accounts</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent>
            <MetricsImportForm
              slug={ctx.workspace.slug}
              today={todayIn(ctx.workspace.timezone, new Date())}
              accounts={manual.map((a) => ({ id: a.id, platform: a.platform, displayName: a.displayName, latestMetricDate: a.latestMetricDate }))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
