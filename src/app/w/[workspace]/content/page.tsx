import { Film, ImageIcon, PenSquare, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DemoBadge } from "@/components/demo/demo-indicators";
import { PlatformIcon } from "@/components/platform/platform-icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PostStatusBadge } from "@/features/content/post-status";
import { PLATFORM_META } from "@/lib/platforms/registry";
import { formatInZone } from "@/lib/time/zoned";
import { cn } from "@/lib/utils/cn";
import { formatRelative } from "@/lib/utils/format";
import { permits, requireWorkspace } from "@/server/auth/context";
import { listPosts } from "@/server/services/content";

export const metadata: Metadata = { title: "Content Studio" };

const FILTERS = [
  { key: "", label: "All" },
  { key: "drafts", label: "Drafts" },
  { key: "ready", label: "Ready" },
  { key: "scheduled", label: "Scheduled" },
  { key: "published", label: "Published" },
  { key: "simulated", label: "Simulated" },
  { key: "failed", label: "Failed" },
  { key: "archived", label: "Archived" },
];

export default async function ContentPage({ params, searchParams }: PageProps<"/w/[workspace]/content">) {
  const { workspace } = await params;
  const query = await searchParams;
  const ctx = await requireWorkspace(workspace);
  const status = typeof query.status === "string" && FILTERS.some((f) => f.key === query.status) ? query.status : "";
  const q = typeof query.q === "string" ? query.q.slice(0, 100) : "";
  const posts = await listPosts(ctx, { status: status || undefined, q });
  const tz = ctx.workspace.timezone;
  const now = new Date();
  const base = `/w/${ctx.workspace.slug}/content`;
  const filters = FILTERS.filter((f) => f.key !== "simulated" || ctx.workspace.isDemo).filter((f) => f.key !== "published" || !ctx.workspace.isDemo);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={ctx.workspace.name}
        title="Content Studio"
        description="Draft, adapt, and schedule posts across platforms. Validation runs for every destination."
        meta={ctx.workspace.isDemo ? <DemoBadge label="Demo content" /> : null}
        actions={
          permits(ctx, "content.create") ? (
            <Button asChild>
              <Link href={`${base}/new`}>
                <PenSquare /> New post
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
          {filters.map((f) => {
            const href = f.key ? `${base}?status=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ""}` : `${base}${q ? `?q=${encodeURIComponent(q)}` : ""}`;
            const active = f.key === status;
            return (
              <Link
                key={f.key || "all"}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center rounded-full border px-3 text-xs transition-colors",
                  active ? "border-gold-400/40 bg-gold-wash text-gold-200" : "border-line text-fg-muted hover:text-fg",
                )}
              >
                {f.label}
              </Link>
            );
          })}
        </nav>
        <form action={base} className="relative w-full sm:w-72" role="search">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-fg-faint" />
          <Input name="q" defaultValue={q} placeholder="Search title or caption" className="pl-8" aria-label="Search posts" />
        </form>
      </div>

      <Card>
        {posts.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={PenSquare}
              title={q || status ? "No posts match" : "No posts yet"}
              description={q || status ? "Try another filter or search." : "Create a post to start planning across platforms."}
              action={
                permits(ctx, "content.create") && !q && !status ? (
                  <Button asChild size="sm">
                    <Link href={`${base}/new`}>New post</Link>
                  </Button>
                ) : null
              }
            />
          </div>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Post</TH>
                <TH>Destinations</TH>
                <TH>Status</TH>
                <TH className="hidden md:table-cell">When</TH>
                <TH className="hidden lg:table-cell">Updated</TH>
              </tr>
            </THead>
            <TBody>
              {posts.map((p) => {
                const when = p.scheduledAt ?? p.plannedFor;
                return (
                  <TR key={p.id} className="relative">
                    <TD className="max-w-md">
                      <Link href={`${base}/${p.id}`} className="block after:absolute after:inset-0">
                        <span className="block truncate text-fg">{p.title || p.caption || "Untitled post"}</span>
                        <span className="mt-0.5 flex items-center gap-2 truncate text-xs text-fg-muted">
                          {p.title ? <span className="truncate">{p.caption}</span> : null}
                          {p.mediaCount ? (
                            <span className="inline-flex shrink-0 items-center gap-1">
                              {p.mediaCount > 1 ? <ImageIcon className="size-3" /> : <Film className="size-3" />}
                              {p.mediaCount}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    </TD>
                    <TD>
                      <span className="flex gap-1.5 text-fg-muted">
                        {p.targets.length ? (
                          p.targets.map((t, i) => (
                            <PlatformIcon key={`${t.platform}-${i}`} platform={t.platform} title={`${PLATFORM_META[t.platform].name}: ${t.status}`} className="size-3.5" />
                          ))
                        ) : (
                          <span className="text-xs text-fg-faint">None</span>
                        )}
                      </span>
                    </TD>
                    <TD>
                      <PostStatusBadge status={p.status} />
                    </TD>
                    <TD className="hidden md:table-cell">
                      {when ? (
                        <span className="text-xs">
                          {p.scheduledAt ? "" : "Planned · "}
                          {formatInZone(when, tz, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      ) : (
                        <span className="text-xs text-fg-faint">—</span>
                      )}
                    </TD>
                    <TD className="hidden text-xs lg:table-cell">{formatRelative(p.updatedAt, now)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
