import { FlaskConical, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { AccessDenied } from "@/components/shell/access-denied";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { AssistantWorkspace, type AssistantMode } from "@/features/assistant/assistant-workspace";
import { PLATFORMS } from "@/lib/platforms/registry";
import { pluralize } from "@/lib/utils/format";
import { aiStatus } from "@/server/ai/provider";
import { permits, requireWorkspace } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { listGenerations } from "@/server/services/ai";
import { currentUsage, planLimit } from "@/server/services/plan-limits";
import { listSocialAccounts } from "@/server/services/social-accounts";

export const metadata: Metadata = { title: "AI Assistant" };

export default async function AssistantPage({ params }: PageProps<"/w/[workspace]/assistant">) {
  const { workspace } = await params;
  const ctx = await requireWorkspace(workspace);
  const header = (meta?: React.ReactNode) => (
    <PageHeader
      eyebrow={ctx.workspace.name}
      title="AI Assistant"
      description="Ideas, captions, hooks, hashtags, campaign plans, and platform adaptations. Drafts only: nothing is published from here."
      meta={meta}
    />
  );

  if (!permits(ctx, "ai.use")) {
    return (
      <div className="space-y-8">
        {header()}
        <AccessDenied permission="ai.use" what="the AI Assistant" />
      </div>
    );
  }

  const status = aiStatus();
  if (status.mode === "misconfigured") {
    return (
      <div className="space-y-8">
        {header()}
        <Alert tone="warning" title="The AI Assistant isn't configured">
          An administrator needs to set the server&apos;s AI credentials (see the README&apos;s AI section) or switch the assistant to demo mode.
        </Alert>
      </div>
    );
  }

  const db = getDb();
  const [history, accounts, used, limit] = await Promise.all([
    listGenerations(ctx),
    listSocialAccounts(ctx),
    currentUsage(db, ctx.organization.id, "ai_generations_per_month"),
    planLimit(db, ctx.organization.id, "ai_generations_per_month"),
  ]);
  const mode: AssistantMode = status.mode === "anthropic" ? { kind: "anthropic", model: status.model } : { kind: "demo" };
  const defaultPlatforms = PLATFORMS.filter((p) => accounts.some((a) => a.platform === p)).slice(0, 3);

  return (
    <div className="space-y-8">
      {header(
        <div className="flex flex-wrap items-center gap-2">
          {mode.kind === "demo" ? (
            <Badge tone="demo" size="md">
              <FlaskConical aria-hidden="true" /> Demo mode · no AI model
            </Badge>
          ) : (
            <Badge tone="silver" size="md">
              <Sparkles aria-hidden="true" /> Claude · {mode.model}
            </Badge>
          )}
          {mode.kind === "anthropic" ? (
            <span className="text-xs text-fg-muted">
              {limit === null ? `${pluralize(used, "generation")} this month` : `${used} of ${pluralize(limit, "generation")} used this month`}
            </span>
          ) : null}
        </div>,
      )}
      {mode.kind === "demo" ? (
        <Alert tone="demo" title="Demo mode">
          No AI provider is configured, so results come from templates built around your brief. They are labelled as demo output and don&apos;t count toward your plan.
        </Alert>
      ) : limit !== null && used >= limit ? (
        <Alert tone="warning" title="Monthly AI limit reached">
          Your plan includes {pluralize(limit, "generation")} a month. New requests are refused until the next month or a plan change.
        </Alert>
      ) : null}
      <AssistantWorkspace
        slug={ctx.workspace.slug}
        mode={mode}
        history={history}
        canCreatePost={permits(ctx, "content.create")}
        defaultPlatforms={defaultPlatforms}
      />
    </div>
  );
}
