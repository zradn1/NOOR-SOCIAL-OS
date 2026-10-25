"use client";

import { Film, ImageIcon, Link2, Plus, Upload, X } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils/cn";
import { formatBytes } from "@/lib/utils/format";
import { addMediaByUrlAction, confirmUploadAction, createUploadAction } from "@/server/actions/content";
import type { MediaView } from "@/server/services/content";

const MIME_OPTIONS = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  video: ["video/mp4", "video/quicktime", "video/webm"],
} as const;

export function MediaTile({ media, onRemove, onMove, index, total }: {
  media: MediaView;
  onRemove?: () => void;
  onMove?: (delta: -1 | 1) => void;
  index?: number;
  total?: number;
}) {
  const Icon = media.kind === "video" ? Film : ImageIcon;
  return (
    <div className="group relative flex items-center gap-3 rounded-md border border-line bg-sunken p-2.5">
      <div className="grid size-12 shrink-0 place-items-center rounded border border-line-strong bg-surface-raised">
        <Icon aria-hidden="true" className="size-5 text-silver-300" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-fg">{media.fileName ?? media.url ?? "Untitled media"}</p>
        <p className="truncate text-xs text-fg-muted">
          {media.mimeType}
          {media.width && media.height ? ` · ${media.width}×${media.height}` : ""}
          {media.durationMs ? ` · ${Math.round(media.durationMs / 1000)}s` : ""}
          {media.source === "url" ? " · linked" : ""}
        </p>
        {media.uploadStatus !== "ready" ? (
          <Badge tone={media.uploadStatus === "failed" ? "danger" : "warning"} className="mt-1">
            Upload {media.uploadStatus}
          </Badge>
        ) : null}
      </div>
      {onMove && typeof index === "number" && typeof total === "number" ? (
        <div className="flex flex-col">
          <button type="button" className="px-1 text-xs text-fg-muted hover:text-fg disabled:opacity-30" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move earlier">
            ▲
          </button>
          <button type="button" className="px-1 text-xs text-fg-muted hover:text-fg disabled:opacity-30" disabled={index === total - 1} onClick={() => onMove(1)} aria-label="Move later">
            ▼
          </button>
        </div>
      ) : null}
      {onRemove ? (
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove media">
          <X />
        </Button>
      ) : null}
    </div>
  );
}

export function MediaPicker({
  slug,
  library,
  attachedIds,
  storageEnabled,
  onAttach,
}: {
  slug: string;
  library: MediaView[];
  attachedIds: string[];
  storageEnabled: boolean;
  onAttach: (media: MediaView) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"image" | "video">("image");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploadState, setUploadState] = useState<string | null>(null);

  const addByUrl = (form: FormData) =>
    startTransition(async () => {
      setError(null);
      const result = await addMediaByUrlAction(slug, Object.fromEntries(form));
      if (!result.ok) {
        setError(result.error.fieldErrors ? Object.values(result.error.fieldErrors).flat()[0] ?? result.error.message : result.error.message);
        return;
      }
      onAttach(result.data);
      setOpen(false);
    });

  const upload = (file: File) =>
    startTransition(async () => {
      setError(null);
      setUploadState(`Uploading ${file.name} (${formatBytes(file.size)})…`);
      const created = await createUploadAction(slug, { fileName: file.name, mimeType: file.type, sizeBytes: file.size });
      if (!created.ok) {
        setError(created.error.message);
        setUploadState(null);
        return;
      }
      const response = await fetch(created.data.signedUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
      if (!response.ok) {
        setError("Storage rejected the upload.");
        setUploadState(null);
        return;
      }
      const confirmed = await confirmUploadAction(slug, created.data.assetId);
      if (!confirmed.ok) {
        setError(confirmed.error.message);
        setUploadState(null);
        return;
      }
      onAttach({
        id: created.data.assetId,
        source: "storage",
        kind: file.type.startsWith("video/") ? "video" : "image",
        mimeType: file.type,
        fileName: file.name,
        url: null,
        width: null,
        height: null,
        durationMs: null,
        altText: null,
        uploadStatus: "ready",
      });
      setUploadState(null);
      setOpen(false);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm">
          <Plus /> Add media
        </Button>
      </DialogTrigger>
      <DialogContent title="Add media" description="Media is referenced by the post; nothing is sent to any platform until publishing." size="lg">
        {error ? <Alert tone="danger" className="mb-4">{error}</Alert> : null}
        <Tabs defaultValue="link" className="space-y-4">
          <TabsList>
            <TabsTrigger value="link">
              <Link2 /> Link
            </TabsTrigger>
            <TabsTrigger value="upload">
              <Upload /> Upload
            </TabsTrigger>
            <TabsTrigger value="library">Library ({library.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="link">
            <form action={addByUrl} className="grid gap-4 sm:grid-cols-2">
              <Field id="media-url" label="Public https:// link" hint="Platforms fetch media from a public URL when publishing." className="sm:col-span-2">
                <Input id="media-url" name="url" type="url" required placeholder="https://cdn.example.com/launch.mp4" />
              </Field>
              <Field id="media-kind" label="Kind">
                <Select id="media-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as "image" | "video")}>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                </Select>
              </Field>
              <Field id="media-mime" label="File type">
                <Select id="media-mime" name="mimeType" key={kind} defaultValue={MIME_OPTIONS[kind][0]}>
                  {MIME_OPTIONS[kind].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="media-width" label="Width (px)" optional>
                <Input id="media-width" name="width" type="number" min={1} />
              </Field>
              <Field id="media-height" label="Height (px)" optional>
                <Input id="media-height" name="height" type="number" min={1} />
              </Field>
              {kind === "video" ? (
                <Field id="media-duration" label="Duration (seconds)" hint="Needed to check platform length limits." className="sm:col-span-2">
                  <Input id="media-duration" name="durationSeconds" type="number" min={0} step="0.1" />
                </Field>
              ) : null}
              <Field id="media-alt" label="Alt text" optional className="sm:col-span-2">
                <Input id="media-alt" name="altText" maxLength={1000} placeholder="Describe the media for screen readers" />
              </Field>
              <div className="sm:col-span-2">
                <Button type="submit" loading={pending} className="w-full">
                  Attach link
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="upload">
            {storageEnabled ? (
              <div className="space-y-3">
                <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-line-strong px-6 py-10 text-center hover:border-silver-700">
                  <Upload aria-hidden="true" className="size-5 text-silver-300" />
                  <span className="text-[13px] text-fg">Choose an image or video</span>
                  <span className="text-xs text-fg-muted">Stored privately in your workspace. JPEG, PNG, WebP, GIF, MP4, MOV, WebM.</span>
                  <input
                    type="file"
                    className="sr-only"
                    accept={[...MIME_OPTIONS.image, ...MIME_OPTIONS.video].join(",")}
                    disabled={pending}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) upload(file);
                    }}
                  />
                </label>
                {uploadState ? <p className="text-xs text-fg-muted">{uploadState}</p> : null}
              </div>
            ) : (
              <Alert tone="info" title="Uploads aren't configured">
                File uploads need Supabase Storage (SUPABASE_SERVICE_ROLE_KEY). Attach media by link instead.
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="library">
            {library.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-fg-muted">No media in this workspace yet.</p>
            ) : (
              <div className="grid max-h-80 gap-2 overflow-y-auto scrollbar-thin sm:grid-cols-2">
                {library.map((m) => {
                  const attached = attachedIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={attached || m.uploadStatus !== "ready"}
                      onClick={() => {
                        onAttach(m);
                        setOpen(false);
                      }}
                      className={cn("text-left transition-opacity", attached ? "opacity-40" : "hover:opacity-80")}
                    >
                      <MediaTile media={m} />
                    </button>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export function HashtagInput({ value, onChange, disabled }: { value: string[]; onChange: (tags: string[]) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const next = draft
      .split(/[\s,]+/)
      .map((t) => t.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, ""))
      .filter(Boolean);
    if (next.length) onChange([...new Set([...value, ...next])]);
    setDraft("");
  };
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-line-strong bg-sunken px-2 py-1.5 focus-within:border-line-focus focus-within:shadow-[var(--shadow-focus)]">
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-gold-400/30 bg-gold-wash px-2 py-0.5 text-xs text-gold-200">
          #{tag}
          {!disabled ? (
            <button type="button" aria-label={`Remove #${tag}`} onClick={() => onChange(value.filter((t) => t !== tag))} className="text-gold-300 hover:text-fg">
              <X className="size-3" />
            </button>
          ) : null}
        </span>
      ))}
      <input
        id="hashtags"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "," || e.key === " ") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={value.length ? "" : "Type a hashtag and press Enter"}
        className="min-w-32 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-faint"
        aria-label="Add hashtag"
      />
    </div>
  );
}
