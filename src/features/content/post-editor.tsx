"use client";

import { AlertTriangle, CalendarClock, Copy, ExternalLink, FlaskConical, Lock, RotateCcw, Save, Send, Trash2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { PlatformBadgeIcon, PlatformIcon } from "@/components/platform/platform-icon";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { composeCaption, countCharacters, PLATFORM_RULES, validateForPlatforms } from "@/lib/platforms/constraints";
import { PLATFORM_META, type Platform } from "@/lib/platforms/registry";
import { cn } from "@/lib/utils/cn";
import {
  archivePostAction,
  deletePostAction,
  duplicatePostAction,
  retryJobAction,
  savePostAction,
  schedulePostAction,
  unschedulePostAction,
} from "@/server/actions/content";
import type { MediaView, PostDetail } from "@/server/services/content";
import { HashtagInput, MediaPicker, MediaTile } from "./media-picker";
import { JobStatusBadge, PostStatusBadge, TargetStatusBadge } from "./post-status";

export type Destination = {
  id: string;
  platform: Platform;
  name: string;
  handle: string | null;
  status: string;
  canPublish: boolean;
};

type Props = {
  slug: string;
  post: PostDetail | null;
  destinations: Destination[];
  library: MediaView[];
  storageEnabled: boolean;
  isDemo: boolean;
  timezone: string;
  zoneLabel: string;
  defaultScheduleDate: string;
  plannedLocal: { date: string; time: string } | null;
  scheduledLabel: string | null;
  permissions: { edit: boolean; schedule: boolean; retry: boolean; delete: boolean };
};

const LOCKED_STATUSES = new Set(["publishing", "published", "partially_published", "simulated"]);

export function PostEditor(props: Props) {
  const { slug, post, destinations, isDemo, permissions } = props;
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState(post?.title ?? "");
  const [caption, setCaption] = useState(post?.caption ?? "");
  const [hashtags, setHashtags] = useState<string[]>(post?.hashtags ?? []);
  const [firstComment, setFirstComment] = useState(post?.firstComment ?? "");
  const [linkUrl, setLinkUrl] = useState(post?.linkUrl ?? "");
  const [plannedDate, setPlannedDate] = useState(props.plannedLocal?.date ?? "");
  const [plannedTime, setPlannedTime] = useState(props.plannedLocal?.time ?? "09:00");
  const [media, setMedia] = useState<MediaView[]>(post?.media ?? []);
  const [selected, setSelected] = useState<Map<string, string>>(
    () => new Map((post?.targets ?? []).filter((t) => t.status !== "cancelled").map((t) => [t.accountId, t.captionOverride ?? ""])),
  );
  const [revision, setRevision] = useState(post?.revision ?? 0);
  const [dirty, setDirty] = useState(!post);
  const [conflict, setConflict] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(props.defaultScheduleDate);
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const status = post?.status ?? "draft";
  const contentLocked = !permissions.edit || LOCKED_STATUSES.has(status) || status === "archived";
  const destinationsLocked = contentLocked || status === "scheduled";
  const touch = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setDirty(true);
  };

  const selectedDestinations = destinations.filter((d) => selected.has(d.id));
  const issues = useMemo(
    () =>
      validateForPlatforms(
        { caption, hashtags, title, firstComment, linkUrl, media: media.map((m) => ({ kind: m.kind, durationMs: m.durationMs })) },
        selectedDestinations.map((d) => ({ platform: d.platform, captionOverride: selected.get(d.id) || null })),
      ),
    [caption, hashtags, title, firstComment, linkUrl, media, selectedDestinations, selected],
  );
  const errors = issues.filter((i) => i.severity === "error");
  const platformsSelected = [...new Set(selectedDestinations.map((d) => d.platform))];

  const payload = (intent: "draft" | "ready") => ({
    id: post?.id,
    expectedRevision: post ? revision : undefined,
    title,
    caption,
    hashtags,
    firstComment,
    linkUrl,
    plannedDate: plannedDate || undefined,
    plannedTime: plannedDate ? plannedTime : undefined,
    targets: [...selected.entries()].map(([accountId, override]) => ({ accountId, captionOverride: override || undefined })),
    mediaIds: media.map((m) => m.id),
    intent,
  });

  const save = (intent: "draft" | "ready", then?: (id: string) => void) =>
    startTransition(async () => {
      const result = await savePostAction(slug, payload(intent));
      if (!result.ok) {
        if (result.error.code === "CONFLICT" && result.error.message.includes("Someone else")) setConflict(true);
        toast.show({ tone: "error", title: result.error.message });
        return;
      }
      setRevision(result.data.revision);
      setDirty(false);
      if (!post) router.replace(`/w/${slug}/content/${result.data.id}`);
      if (then) then(result.data.id);
      else toast.show({ tone: "success", title: intent === "ready" ? "Saved and marked ready" : "Draft saved" });
    });

  const schedule = () =>
    startTransition(async () => {
      setScheduleError(null);
      let postId = post?.id;
      if (!postId || dirty) {
        const saved = await savePostAction(slug, payload(status === "ready" ? "ready" : "draft"));
        if (!saved.ok) {
          setScheduleError(saved.error.message);
          return;
        }
        postId = saved.data.id;
        setRevision(saved.data.revision);
        setDirty(false);
      }
      const result = await schedulePostAction(slug, { postId, date: scheduleDate, time: scheduleTime });
      if (!result.ok) {
        setScheduleError(result.error.message);
        return;
      }
      toast.show({
        tone: "success",
        title: isDemo ? "Scheduled (demo)" : "Scheduled",
        description: isDemo ? "At the scheduled time it will be simulated. Nothing is posted." : "It will publish only when the platform confirms.",
      });
      if (!post) router.replace(`/w/${slug}/content/${postId}`);
    });

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: { message: string } } | undefined>) =>
    startTransition(async () => {
      const result = await fn();
      if (!result) return;
      if (!result.ok) toast.show({ tone: "error", title: result.error?.message ?? "Something went wrong" });
      else if (result.message) toast.show({ tone: "success", title: result.message });
    });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        {isDemo ? (
          <Alert tone="demo" title="Demo workspace">
            Scheduling works end to end here, but at the scheduled time the post is <strong>simulated</strong>: nothing is
            sent to any platform.
          </Alert>
        ) : null}
        {conflict ? (
          <Alert tone="warning" title="This post changed elsewhere" action={<Button size="sm" variant="secondary" onClick={() => router.refresh()}>Reload</Button>}>
            Saving now would overwrite a newer version. Reload to see the latest changes.
          </Alert>
        ) : null}
        {LOCKED_STATUSES.has(status) ? (
          <Alert tone="info" title="Content is locked">
            {status === "simulated"
              ? "This demo post was simulated. Duplicate it to make changes."
              : "This post is publishing or has gone out. Duplicate it to create a new version."}
          </Alert>
        ) : !permissions.edit ? (
          <Alert tone="neutral" title="View only">Your role can view content but not change it.</Alert>
        ) : null}

        <Card>
          <CardHeader title="Post" description="One message, adapted per platform." actions={<PostStatusBadge status={status} />} />
          <CardContent className="space-y-5">
            <Field
              id="title"
              label="Title"
              optional={!platformsSelected.includes("youtube")}
              hint={platformsSelected.includes("youtube") ? "YouTube requires a title." : "Internal reference; used as the title on YouTube and Pinterest."}
            >
              <Input id="title" value={title} maxLength={120} disabled={contentLocked} onChange={(e) => touch(setTitle)(e.target.value)} />
            </Field>
            <div className="space-y-1.5">
              <label htmlFor="caption" className="block text-[13px] font-medium text-fg-secondary">
                Caption
              </label>
              <Textarea
                id="caption"
                value={caption}
                rows={7}
                disabled={contentLocked}
                onChange={(e) => touch(setCaption)(e.target.value)}
                placeholder="Write the message…"
              />
              <div className="flex flex-wrap gap-2" aria-live="polite">
                {platformsSelected.length === 0 ? (
                  <span className="text-xs text-fg-faint">Choose destinations to see per-platform limits.</span>
                ) : (
                  platformsSelected.map((p) => {
                    const rules = PLATFORM_RULES[p];
                    const n = countCharacters(composeCaption(caption, hashtags), rules.counting);
                    const over = n > rules.captionMax;
                    return (
                      <span
                        key={p}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs tabular",
                          over ? "border-danger/40 text-danger" : "border-line text-fg-muted",
                        )}
                      >
                        <PlatformIcon platform={p} className="size-3" />
                        {n.toLocaleString("en")} / {rules.captionMax.toLocaleString("en")}
                      </span>
                    );
                  })
                )}
              </div>
            </div>
            <Field id="hashtags" label="Hashtags" hint="Added on their own line after the caption.">
              <HashtagInput value={hashtags} onChange={touch(setHashtags)} disabled={contentLocked} />
            </Field>
            <div className="grid gap-5 md:grid-cols-2">
              <Field id="firstComment" label="First comment" optional hint="Posted as the first comment where supported.">
                <Textarea id="firstComment" rows={2} value={firstComment} disabled={contentLocked} onChange={(e) => touch(setFirstComment)(e.target.value)} />
              </Field>
              <Field id="linkUrl" label="Link" optional hint="Destination link (Pinterest) or link preview.">
                <Input id="linkUrl" type="url" value={linkUrl} disabled={contentLocked} placeholder="https://" onChange={(e) => touch(setLinkUrl)(e.target.value)} />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Media"
            description={`${media.length} item${media.length === 1 ? "" : "s"} · order matters for carousels`}
            actions={
              !contentLocked ? (
                <MediaPicker
                  slug={slug}
                  library={props.library}
                  attachedIds={media.map((m) => m.id)}
                  storageEnabled={props.storageEnabled}
                  onAttach={(m) => {
                    setMedia((all) => [...all, m]);
                    setDirty(true);
                  }}
                />
              ) : null
            }
          />
          <CardContent className="space-y-2">
            {media.length === 0 ? (
              <p className="rounded-md border border-dashed border-line-strong py-6 text-center text-[13px] text-fg-muted">No media attached.</p>
            ) : (
              media.map((m, i) => (
                <MediaTile
                  key={m.id}
                  media={m}
                  index={i}
                  total={media.length}
                  onRemove={contentLocked ? undefined : () => {
                    setMedia((all) => all.filter((x) => x.id !== m.id));
                    setDirty(true);
                  }}
                  onMove={contentLocked ? undefined : (delta) => {
                    setMedia((all) => {
                      const next = [...all];
                      const [item] = next.splice(i, 1);
                      next.splice(i + delta, 0, item!);
                      return next;
                    });
                    setDirty(true);
                  }}
                />
              ))
            )}
          </CardContent>
        </Card>

        {selectedDestinations.length ? (
          <Card>
            <CardHeader title="Per-platform captions" description="Leave empty to use the main caption." />
            <CardContent className="space-y-4">
              {selectedDestinations.map((d) => (
                <details key={d.id} className="group rounded-md border border-line" open={Boolean(selected.get(d.id))}>
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-[13px] text-fg-secondary">
                    <PlatformIcon platform={d.platform} className="text-fg-muted" />
                    Customize for {PLATFORM_META[d.platform].name}
                    <span className="text-fg-faint">· {d.name}</span>
                    {selected.get(d.id) ? <Badge tone="gold" className="ml-auto">Custom</Badge> : null}
                  </summary>
                  <div className="border-t border-line p-3">
                    <Textarea
                      aria-label={`Caption for ${PLATFORM_META[d.platform].name}`}
                      rows={3}
                      value={selected.get(d.id) ?? ""}
                      disabled={destinationsLocked}
                      onChange={(e) => {
                        setSelected((m) => new Map(m).set(d.id, e.target.value));
                        setDirty(true);
                      }}
                    />
                  </div>
                </details>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {post && post.targets.length ? <DeliveryPanel slug={slug} post={post} canRetry={permissions.retry} onRetry={(jobId) => run(() => retryJobAction(slug, jobId))} /> : null}
      </div>

      <aside className="space-y-6">
        <Card>
          <CardHeader title="Destinations" description={destinationsLocked && status === "scheduled" ? "Unschedule to change destinations." : "Where this post will go."} />
          <CardContent className="space-y-1">
            {destinations.length === 0 ? (
              <p className="text-[13px] text-fg-muted">No accounts in this workspace yet.</p>
            ) : (
              destinations.map((d) => (
                <label
                  key={d.id}
                  className={cn("flex items-center gap-3 rounded-md px-2 py-2", destinationsLocked ? "opacity-70" : "cursor-pointer hover:bg-surface-raised")}
                >
                  <Checkbox
                    checked={selected.has(d.id)}
                    disabled={destinationsLocked}
                    onChange={(e) => {
                      setSelected((m) => {
                        const next = new Map(m);
                        if (e.target.checked) next.set(d.id, "");
                        else next.delete(d.id);
                        return next;
                      });
                      setDirty(true);
                    }}
                  />
                  <PlatformBadgeIcon platform={d.platform} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-fg">{d.name}</span>
                    <span className="block truncate text-xs text-fg-muted">
                      {d.status === "demo" ? "Demo · simulated" : d.status === "manual" ? "Manual · can't publish" : d.canPublish ? "Connected" : "Not connected"}
                    </span>
                  </span>
                  {!d.canPublish ? <Lock aria-label="Cannot publish" className="size-3.5 text-fg-faint" /> : null}
                </label>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Checks" description={issues.length ? `${errors.length} error${errors.length === 1 ? "" : "s"}, ${issues.length - errors.length} warning${issues.length - errors.length === 1 ? "" : "s"}` : "Ready for the selected platforms"} />
          <CardContent>
            {issues.length === 0 ? (
              <p className="text-[13px] text-success">{selectedDestinations.length ? "No problems found." : "Select destinations to validate."}</p>
            ) : (
              <ul className="space-y-2">
                {issues.map((issue, i) => (
                  <li key={`${issue.platform}-${issue.code}-${i}`} className="flex gap-2 text-xs leading-relaxed">
                    {issue.severity === "error" ? (
                      <XCircle aria-label="Error" className="mt-0.5 size-3.5 shrink-0 text-danger" />
                    ) : (
                      <AlertTriangle aria-label="Warning" className="mt-0.5 size-3.5 shrink-0 text-warning" />
                    )}
                    <span className="text-fg-secondary">{issue.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Timing" description={`Times are in ${props.zoneLabel}.`} />
          <CardContent className="space-y-4">
            {status === "scheduled" || status === "publishing" ? (
              <div className="space-y-3">
                <p className="text-[13px] text-fg">
                  <CalendarClock aria-hidden="true" className="mr-1.5 inline size-4 text-info" />
                  {props.scheduledLabel}
                </p>
                {permissions.schedule && status === "scheduled" ? (
                  <div className="flex flex-wrap gap-2">
                    <ScheduleDialog
                      label="Reschedule"
                      date={scheduleDate}
                      time={scheduleTime}
                      onDate={setScheduleDate}
                      onTime={setScheduleTime}
                      error={scheduleError}
                      pending={pending}
                      disabled={errors.length > 0}
                      onConfirm={schedule}
                      zoneLabel={props.zoneLabel}
                      isDemo={isDemo}
                    />
                    <Button variant="ghost" size="sm" loading={pending} onClick={() => post && run(() => unschedulePostAction(slug, post.id))}>
                      Unschedule
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Field id="plannedDate" label="Planned date" optional>
                    <Input id="plannedDate" type="date" value={plannedDate} disabled={contentLocked} onChange={(e) => touch(setPlannedDate)(e.target.value)} />
                  </Field>
                  <Field id="plannedTime" label="Time">
                    <Input id="plannedTime" type="time" value={plannedTime} disabled={contentLocked || !plannedDate} onChange={(e) => touch(setPlannedTime)(e.target.value)} />
                  </Field>
                </div>
                <p className="text-xs text-fg-muted">A planned date shows the draft on the calendar. It doesn&apos;t publish anything.</p>
                {permissions.schedule && !contentLocked ? (
                  <ScheduleDialog
                    label="Schedule"
                    date={scheduleDate}
                    time={scheduleTime}
                    onDate={setScheduleDate}
                    onTime={setScheduleTime}
                    error={scheduleError}
                    pending={pending}
                    disabled={errors.length > 0 || selectedDestinations.length === 0 || selectedDestinations.some((d) => !d.canPublish)}
                    disabledReason={
                      selectedDestinations.length === 0
                        ? "Choose destinations first."
                        : selectedDestinations.some((d) => !d.canPublish)
                          ? "Some destinations aren't connected and can't publish."
                          : errors.length
                            ? "Fix the errors in Checks first."
                            : undefined
                    }
                    onConfirm={schedule}
                    zoneLabel={props.zoneLabel}
                    isDemo={isDemo}
                  />
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          {!contentLocked ? (
            <>
              <Button variant="secondary" loading={pending} onClick={() => save("draft")}>
                <Save /> Save draft
              </Button>
              {status !== "scheduled" ? (
                <Button variant="outline" loading={pending} onClick={() => save("ready")}>
                  Mark ready
                </Button>
              ) : (
                <Button variant="outline" loading={pending} onClick={() => save("draft")}>
                  Save changes
                </Button>
              )}
            </>
          ) : null}
          {post && permissions.edit ? (
            <Button variant="ghost" loading={pending} onClick={() => run(() => duplicatePostAction(slug, post.id))}>
              <Copy /> Duplicate
            </Button>
          ) : null}
          {post && permissions.edit && status !== "publishing" ? (
            status === "archived" ? (
              <Button variant="ghost" onClick={() => run(() => archivePostAction(slug, post.id, false))}>
                <RotateCcw /> Restore
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => run(() => archivePostAction(slug, post.id, true))}>
                Archive
              </Button>
            )
          ) : null}
          {post && permissions.delete && status !== "publishing" ? (
            <Button
              variant="ghost"
              className="text-danger hover:text-danger"
              onClick={() => {
                if (window.confirm("Delete this post? Anything queued for it is cancelled.")) run(() => deletePostAction(slug, post.id));
              }}
            >
              <Trash2 /> Delete
            </Button>
          ) : null}
        </div>
        {dirty && !contentLocked ? <p className="text-xs text-warning">Unsaved changes</p> : null}
      </aside>
    </div>
  );
}

function ScheduleDialog(props: {
  label: string;
  date: string;
  time: string;
  onDate: (v: string) => void;
  onTime: (v: string) => void;
  error: string | null;
  pending: boolean;
  disabled: boolean;
  disabledReason?: string;
  onConfirm: () => void;
  zoneLabel: string;
  isDemo: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" disabled={props.disabled} title={props.disabledReason}>
          <Send /> {props.label}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`${props.label} post`}
        description={`Pick a time in ${props.zoneLabel}. The post is queued and published only when each platform confirms.`}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button loading={props.pending} onClick={props.onConfirm}>
              {props.label}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {props.error ? <Alert tone="danger">{props.error}</Alert> : null}
          {props.isDemo ? (
            <Alert tone="demo">
              <FlaskConical className="mr-1 inline size-3.5" /> Demo: the post will be simulated, not published.
            </Alert>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field id="schedule-date" label="Date">
              <Input id="schedule-date" type="date" value={props.date} onChange={(e) => props.onDate(e.target.value)} />
            </Field>
            <Field id="schedule-time" label="Time">
              <Input id="schedule-time" type="time" value={props.time} onChange={(e) => props.onTime(e.target.value)} />
            </Field>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeliveryPanel({
  post,
  canRetry,
  onRetry,
}: {
  slug: string;
  post: PostDetail;
  canRetry: boolean;
  onRetry: (jobId: string) => void;
}) {
  return (
    <Card>
      <CardHeader title="Delivery" description="Status per destination. “Published” always means the platform confirmed the post." />
      <CardContent>
        <ul className="divide-y divide-line">
          {post.targets.map((t) => (
            <li key={t.id} className="flex flex-wrap items-start gap-3 py-3">
              <PlatformBadgeIcon platform={t.platform} size="sm" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-[13px] text-fg">{t.accountName}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <TargetStatusBadge status={t.status} />
                  {t.job ? <JobStatusBadge status={t.job.status} /> : null}
                  {t.job && t.job.attempts > 0 ? <span className="text-2xs text-fg-faint">Attempt {t.job.attempts}</span> : null}
                </div>
                {t.lastError || t.job?.lastError ? (
                  <p className="text-xs text-danger">{t.job?.lastError ?? t.lastError}</p>
                ) : null}
                {t.job?.errorCode === "outcome_unknown" ? (
                  <p className="text-xs text-warning">Check the platform before retrying: the post may already be live.</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {t.externalUrl ? (
                  <Button asChild size="sm" variant="ghost">
                    <a href={t.externalUrl} target="_blank" rel="noreferrer noopener">
                      <ExternalLink /> View
                    </a>
                  </Button>
                ) : null}
                {canRetry && t.job && (t.job.status === "failed" || t.job.status === "blocked") ? (
                  <Button size="sm" variant="secondary" onClick={() => onRetry(t.job!.id)}>
                    <RotateCcw /> Retry
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
