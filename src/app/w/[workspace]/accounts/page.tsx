import { KeyRound, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { FreshnessIndicator } from "@/components/data/data-source-badge";
import { DemoBadge } from "@/components/demo/demo-indicators";
import { PlatformBadgeIcon } from "@/components/platform/platform-icon";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  AddDemoAccountButton,
  ConnectButton,
  DisconnectButton,
  TrackManuallyDialog,
} from "@/features/accounts/account-actions";
import { ConnectionStatusBadge } from "@/features/accounts/connection-status";
import { CreateDemoWorkspaceButton } from "@/features/demo/create-demo-button";
import { PLATFORM_META, PLATFORMS, isPlatform } from "@/lib/platforms/registry";
import { permits, requireWorkspace } from "@/server/auth/context";
import { canConnect, listProviderStatuses } from "@/server/integrations/registry";
import { listSocialAccounts } from "@/server/services/social-accounts";

export const metadata: Metadata = { title: "Social accounts" };

const INTEGRATION_ERRORS: Record<string, string> = {
  integration_unavailable: "That platform's official integration isn't available yet, so no connection was attempted.",
  limit_exceeded: "Your plan's social account limit has been reached.",
  invalid_state: "The authorization link was invalid or already used. Start again from this page.",
  expired_state: "The authorization took too long and expired. Start again from this page.",
  wrong_user: "The authorization was started by a different user.",
  provider_error: "The platform rejected the connection. Nothing was connected.",
  not_implemented: "That platform's official integration isn't built yet. Nothing was connected.",
  denied: "Authorization was cancelled on the platform.",
  rate_limited: "Too many connection attempts. Wait a few minutes and try again.",
};

export default async function AccountsPage({ params, searchParams }: PageProps<"/w/[workspace]/accounts">) {
  const { workspace } = await params;
  const query = await searchParams;
  const ctx = await requireWorkspace(workspace);
  const [accounts, providers] = await Promise.all([listSocialAccounts(ctx), Promise.resolve(listProviderStatuses())]);
  const canManage = permits(ctx, "accounts.connect");
  const isDemo = ctx.workspace.isDemo;
  const now = new Date();
  const errorKey = typeof query.integration_error === "string" ? query.integration_error : null;
  const connected = typeof query.connected === "string" && isPlatform(query.connected) ? query.connected : null;
  const livePlatforms = new Set(accounts.map((a) => a.platform));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={ctx.workspace.name}
        title="Social accounts"
        description="Accounts this workspace publishes to and measures. Connections use each platform's official authorization; NOOR never asks for passwords."
        meta={isDemo ? <DemoBadge label="Demo workspace" /> : null}
      />

      {isDemo ? (
        <Alert tone="demo" title="Every account here is simulated">
          Demo accounts aren&apos;t connected to any platform. Their metrics are synthetic, and publishing ends in a
          &ldquo;simulated&rdquo; state. Real accounts can only be connected in a regular workspace.
        </Alert>
      ) : null}
      {errorKey ? (
        <Alert tone="warning" title="Account not connected">
          {INTEGRATION_ERRORS[errorKey] ?? "The connection didn't complete. Nothing was connected."}
        </Alert>
      ) : null}
      {connected ? (
        <Alert tone="success" title={`${PLATFORM_META[connected].name} connected`}>
          The platform confirmed the authorization.
        </Alert>
      ) : null}

      <Card>
        <CardHeader title="Accounts in this workspace" description={`${accounts.length} account${accounts.length === 1 ? "" : "s"}`} />
        {accounts.length === 0 ? (
          <CardContent>
            <EmptyState
              compact
              icon={KeyRound}
              title="No accounts yet"
              description={
                isDemo
                  ? "Add demo accounts below to explore with simulated data."
                  : "Official integrations aren't available in this build yet. You can track accounts manually to import analytics, or explore a demo workspace."
              }
              action={!isDemo && permits(ctx, "demo.manage") ? <CreateDemoWorkspaceButton slug={ctx.workspace.slug} /> : null}
            />
          </CardContent>
        ) : (
          <Table className="mt-4">
            <THead>
              <tr>
                <TH>Account</TH>
                <TH>Status</TH>
                <TH className="hidden lg:table-cell">Identifier</TH>
                <TH className="hidden md:table-cell">Last sync</TH>
                <TH className="hidden xl:table-cell">Permissions</TH>
                <TH className="text-right">
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {accounts.map((a) => (
                <TR key={a.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <PlatformBadgeIcon platform={a.platform} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-fg">{a.displayName}</p>
                        <p className="truncate text-xs text-fg-muted">
                          {PLATFORM_META[a.platform].name}
                          {a.handle ? ` · ${PLATFORM_META[a.platform].handlePrefix}${a.handle}` : ""}
                        </p>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <ConnectionStatusBadge status={a.status} />
                    {a.lastError ? <p className="mt-1 max-w-56 truncate text-xs text-danger">{a.lastError}</p> : null}
                  </TD>
                  <TD className="hidden lg:table-cell">
                    <code className="font-mono text-2xs text-fg-muted">{a.externalAccountId}</code>
                  </TD>
                  <TD className="hidden md:table-cell">
                    {a.status === "manual" ? (
                      <span className="text-xs text-fg-muted">
                        {a.latestMetricDate ? `Imported through ${a.latestMetricDate}` : "No imports yet"}
                      </span>
                    ) : (
                      <FreshnessIndicator capturedAt={a.lastSyncedAt} now={now} />
                    )}
                  </TD>
                  <TD className="hidden xl:table-cell">
                    {a.scopes.length ? (
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {a.scopes.map((s) => (
                          <Badge key={s} tone="neutral" className="font-mono">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-fg-faint">{a.status === "connected" ? "None granted" : "Not applicable"}</span>
                    )}
                  </TD>
                  <TD className="text-right">
                    {permits(ctx, "accounts.disconnect") && a.status !== "disconnected" ? (
                      <DisconnectButton
                        slug={ctx.workspace.slug}
                        accountId={a.id}
                        name={a.displayName}
                        mode={a.status === "demo" || a.status === "manual" ? "remove" : "disconnect"}
                      />
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <section className="space-y-4" aria-labelledby="add-account">
        <div className="space-y-1">
          <h2 id="add-account" className="text-base font-medium text-fg">
            {isDemo ? "Add demo accounts" : "Connect a platform"}
          </h2>
          <p className="text-[13px] text-fg-muted">
            {isDemo
              ? "Each demo account comes with 120 days of synthetic, clearly labelled history."
              : "Status of each official integration in this deployment."}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PLATFORMS.map((platform) => {
            const status = providers.find((p) => p.platform === platform)!;
            const available = canConnect(status);
            return (
              <Card key={platform} className="flex flex-col">
                <div className="flex items-start gap-3 p-5 pb-3">
                  <PlatformBadgeIcon platform={platform} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-[15px] font-medium text-fg">{PLATFORM_META[platform].name}</p>
                    {isDemo ? (
                      <Badge tone="demo">Simulated</Badge>
                    ) : available ? (
                      <Badge tone="success">Available</Badge>
                    ) : (
                      <Badge tone="warning">Official integration not available</Badge>
                    )}
                  </div>
                </div>
                <div className="flex-1 px-5 text-xs leading-relaxed text-fg-muted">
                  {isDemo ? (
                    livePlatforms.has(platform) ? "Already added to this demo workspace." : "Adds a simulated account. Nothing connects to the platform."
                  ) : (
                    <>
                      <p>{status.summary}</p>
                      {canManage && status.missingConfig.length ? (
                        <p className="mt-2">
                          Needs: {status.missingConfig.map((k) => (
                            <code key={k} className="mr-1 font-mono text-2xs text-fg-secondary">
                              {k}
                            </code>
                          ))}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
                {canManage ? (
                  <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
                    {isDemo ? (
                      livePlatforms.has(platform) ? null : <AddDemoAccountButton slug={ctx.workspace.slug} platform={platform} />
                    ) : (
                      <>
                        <ConnectButton slug={ctx.workspace.slug} platform={platform} enabled={available} reason={status.summary} />
                        <TrackManuallyDialog slug={ctx.workspace.slug} platform={platform} />
                      </>
                    )}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      </section>

      <Card>
        <CardContent className="flex gap-4">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-gold-300" />
          <div className="space-y-1.5 text-[13px] leading-relaxed text-fg-muted">
            <p className="font-medium text-fg">How connections are protected</p>
            <p>
              Accounts connect only through the platform&apos;s own authorization screen with a single-use, time-limited
              state and PKCE. Access tokens are encrypted with AES-256-GCM before storage and never reach the browser.
              Disconnecting erases them and revokes access at the platform where its API allows it.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
