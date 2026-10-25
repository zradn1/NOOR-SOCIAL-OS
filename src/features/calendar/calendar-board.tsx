"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { PlatformIcon } from "@/components/platform/platform-icon";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { Platform } from "@/lib/platforms/registry";
import { cn } from "@/lib/utils/cn";
import { schedulePostAction, setPlannedDateAction } from "@/server/actions/content";
import { PostStatusBadge } from "../content/post-status";

export type BoardItem = {
  id: string;
  title: string;
  status: string;
  kind: "scheduled" | "planned" | "published";
  date: string;
  time: string;
  platforms: Platform[];
};

const KIND_STYLE: Record<string, string> = {
  scheduled: "border-info/35 bg-info-wash text-fg",
  planned: "border-dashed border-line-strong bg-transparent text-fg-secondary",
  published: "border-success/30 bg-success-wash text-fg",
  simulated: "border-demo-line bg-demo-wash text-fg",
  failed: "border-danger/35 bg-danger-wash text-fg",
};

function styleFor(item: BoardItem) {
  if (item.status === "simulated") return KIND_STYLE.simulated;
  if (item.status === "failed" || item.status === "partially_published") return KIND_STYLE.failed;
  return KIND_STYLE[item.kind];
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarBoard({
  slug,
  view,
  days,
  month,
  today,
  items,
  canSchedule,
  canEdit,
  zoneLabel,
}: {
  slug: string;
  view: "month" | "week";
  days: string[];
  month: string;
  today: string;
  items: BoardItem[];
  canSchedule: boolean;
  canEdit: boolean;
  zoneLabel: string;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState<string | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const [selected, setSelected] = useState<BoardItem | null>(null);
  const [moveDate, setMoveDate] = useState("");
  const [moveTime, setMoveTime] = useState("");
  const [error, setError] = useState<string | null>(null);

  const byDay = new Map<string, BoardItem[]>();
  for (const item of items) byDay.set(item.date, [...(byDay.get(item.date) ?? []), item]);

  const movable = (item: BoardItem) =>
    (item.kind === "scheduled" && item.status === "scheduled" && canSchedule) || (item.kind === "planned" && canEdit);

  const move = (item: BoardItem, date: string, time: string, onDone?: () => void) =>
    startTransition(async () => {
      setError(null);
      const result =
        item.kind === "scheduled"
          ? await schedulePostAction(slug, { postId: item.id, date, time })
          : await setPlannedDateAction(slug, { postId: item.id, date, time });
      if (!result.ok) {
        setError(result.error.message);
        toast.show({ tone: "error", title: "Couldn't move the post", description: result.error.message });
        return;
      }
      toast.show({ tone: "success", title: item.kind === "scheduled" ? `Rescheduled to ${date} ${time}` : `Planned for ${date}` });
      onDone?.();
    });

  const open = (item: BoardItem) => {
    setSelected(item);
    setMoveDate(item.date);
    setMoveTime(item.time);
    setError(null);
  };

  const chip = (item: BoardItem, compact: boolean) => (
    <button
      key={item.id}
      type="button"
      draggable={movable(item) && !pending}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", item.id);
        e.dataTransfer.effectAllowed = "move";
        setDragging(item.id);
      }}
      onDragEnd={() => {
        setDragging(null);
        setOverDay(null);
      }}
      onClick={() => open(item)}
      className={cn(
        "w-full rounded border px-1.5 text-left transition-opacity",
        compact ? "py-0.5" : "space-y-1 p-2",
        styleFor(item),
        movable(item) && "cursor-grab active:cursor-grabbing",
        dragging === item.id && "opacity-40",
      )}
      aria-label={`${item.title}, ${item.kind === "planned" ? "draft planned" : item.status} at ${item.time}`}
    >
      <span className="flex items-center gap-1.5">
        <span className="shrink-0 text-2xs text-fg-muted tabular">{item.time}</span>
        <span className={cn("min-w-0 flex-1 truncate", compact ? "text-2xs" : "text-xs")}>{item.title}</span>
      </span>
      {!compact ? (
        <span className="flex items-center gap-1 text-fg-muted">
          {item.platforms.map((p) => (
            <PlatformIcon key={p} platform={p} className="size-3" />
          ))}
          {item.kind === "planned" ? <span className="ml-auto text-2xs">Draft</span> : null}
        </span>
      ) : null}
    </button>
  );

  const dropProps = (day: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragging) return;
      e.preventDefault();
      setOverDay(day);
    },
    onDragLeave: () => setOverDay((d) => (d === day ? null : d)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain");
      const item = items.find((i) => i.id === id);
      setOverDay(null);
      setDragging(null);
      if (item && item.date !== day) move(item, day, item.time);
    },
  });

  return (
    <>
      {error && !selected ? <Alert tone="danger" className="mb-4">{error}</Alert> : null}
      <div className="relative overflow-x-auto rounded-lg border border-line bg-surface scrollbar-thin" aria-busy={pending}>
        <div className="grid min-w-[44rem] grid-cols-7 border-b border-line">
          {WEEKDAYS.map((d, i) => (
            <div key={d} className="eyebrow px-3 py-2.5">
              {view === "week" ? `${d} ${days[i]!.slice(8)}` : d}
            </div>
          ))}
        </div>
        <div className={cn("grid min-w-[44rem] grid-cols-7", view === "month" ? "auto-rows-[minmax(7.5rem,auto)]" : "auto-rows-[minmax(26rem,auto)]")}>
          {days.map((day) => {
            const list = byDay.get(day) ?? [];
            const outside = view === "month" && day.slice(0, 7) !== month;
            const limit = view === "month" ? 3 : 50;
            return (
              <div
                key={day}
                {...dropProps(day)}
                className={cn(
                  "space-y-1 border-r border-b border-line p-1.5 [&:nth-child(7n)]:border-r-0",
                  outside && "bg-sunken/60",
                  overDay === day && "bg-gold-wash ring-1 ring-gold-400/40 ring-inset",
                )}
              >
                {view === "month" ? (
                  <div className="flex items-center justify-between px-1">
                    <span
                      className={cn(
                        "grid size-6 place-items-center rounded-full text-xs tabular",
                        day === today ? "bg-gold-400 font-semibold text-gold-ink" : outside ? "text-fg-faint" : "text-fg-secondary",
                      )}
                    >
                      {Number(day.slice(8))}
                    </span>
                  </div>
                ) : day === today ? (
                  <p className="px-1 text-2xs font-medium text-gold-300">Today</p>
                ) : null}
                {list.slice(0, limit).map((item) => chip(item, view === "month"))}
                {list.length > limit ? (
                  <Link href={`?view=week&date=${day}`} className="block px-1 text-2xs text-fg-muted hover:text-fg">
                    +{list.length - limit} more
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        {selected ? (
          <DialogContent
            title={selected.title}
            description={`${selected.kind === "planned" ? "Planned draft" : "Post"} · ${selected.date} ${selected.time} (${zoneLabel})`}
            footer={
              <>
                <Button asChild variant="ghost">
                  <Link href={`/w/${slug}/content/${selected.id}`}>Open in editor</Link>
                </Button>
                {movable(selected) ? (
                  <Button loading={pending} onClick={() => move(selected, moveDate, moveTime, () => setSelected(null))}>
                    {selected.kind === "scheduled" ? "Reschedule" : "Move draft"}
                  </Button>
                ) : null}
              </>
            }
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <PostStatusBadge status={selected.status} />
                {selected.platforms.map((p) => (
                  <PlatformIcon key={p} platform={p} className="size-4 text-fg-muted" />
                ))}
              </div>
              {error ? <Alert tone="danger">{error}</Alert> : null}
              {movable(selected) ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field id="move-date" label="Date">
                    <Input id="move-date" type="date" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} />
                  </Field>
                  <Field id="move-time" label="Time">
                    <Input id="move-time" type="time" value={moveTime} onChange={(e) => setMoveTime(e.target.value)} />
                  </Field>
                </div>
              ) : (
                <p className="text-[13px] text-fg-muted">
                  {selected.kind === "published"
                    ? "This post has already gone out (or was simulated in demo). It can't be moved."
                    : "Your role can't move this post."}
                </p>
              )}
              {selected.kind === "scheduled" && movable(selected) ? (
                <p className="text-xs text-fg-muted">Rescheduling replaces the queued job; the post is re-validated for every destination.</p>
              ) : null}
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
