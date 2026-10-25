"use client";

import { Check, Copy, FilePlus2, FlaskConical, History, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { PlatformIcon } from "@/components/platform/platform-icon";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { describedBy, Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { AI_TASK_META, AI_TASKS, AI_TONES, type AiTask } from "@/lib/ai/tasks";
import { PLATFORM_META, PLATFORMS, type Platform } from "@/lib/platforms/registry";
import { cn } from "@/lib/utils/cn";
import { formatRelative } from "@/lib/utils/format";
import { generateAction } from "@/server/actions/ai";
import type { Generation } from "@/server/services/ai";

export type AssistantMode = { kind: "anthropic"; model: string } | { kind: "demo" };

export function AssistantWorkspace({
  slug,
  mode,
  history,
  canCreatePost,
  defaultPlatforms,
}: {
  slug: string;
  mode: AssistantMode;
  history: Generation[];
  canCreatePost: boolean;
  defaultPlatforms: Platform[];
}) {
  const [task, setTask] = useState<AiTask>("caption");
  const [brief, setBrief] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>(defaultPlatforms);
  const [tone, setTone] = useState<(typeof AI_TONES)[number]>("warm");
  const [audience, setAudience] = useState("");
  const [language, setLanguage] = useState("English");
  const [count, setCount] = useState<number>(AI_TASK_META.caption.defaultCount);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [results, setResults] = useState<Generation[]>(history);
  const [activeId, setActiveId] = useState<string | null>(history[0]?.id ?? null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const meta = AI_TASK_META[task];
  const active = results.find((g) => g.id === activeId) ?? null;

  function chooseTask(next: AiTask) {
    setTask(next);
    setCount(AI_TASK_META[next].defaultCount);
    setErrors({});
  }

  function togglePlatform(p: Platform) {
    setPlatforms((current) => (current.includes(p) ? current.filter((x) => x !== p) : [...current, p]));
  }

  function generate() {
    setFailure(null);
    setErrors({});
    startTransition(async () => {
      const result = await generateAction(slug, {
        task,
        brief,
        platforms,
        tone,
        audience,
        language,
        count: task === "adapt" ? undefined : count,
      });
      if (!result.ok) {
        if (result.error.fieldErrors) setErrors(result.error.fieldErrors);
        setFailure(result.error.message);
        return;
      }
      setResults((current) => [result.data, ...current.filter((g) => g.id !== result.data.id)].slice(0, 30));
      setActiveId(result.data.id);
    });
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <Card className="h-fit xl:sticky xl:top-6">
        <CardHeader title="Brief" description={meta.description} />
        <CardContent className="space-y-5">
          <div role="radiogroup" aria-label="What to create" className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {AI_TASKS.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={t === task}
                title={AI_TASK_META[t].label}
                onClick={() => chooseTask(t)}
                className={cn(
                  "h-9 rounded-md border px-2 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400",
                  t === task ? "border-gold-400/40 bg-gold-wash text-gold-200" : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
                )}
              >
                {AI_TASK_META[t].shortLabel}
              </button>
            ))}
          </div>

          <Field id="ai-brief" label={meta.briefLabel} error={errors.brief}>
            <Textarea
              id="ai-brief"
              rows={task === "adapt" ? 7 : 4}
              value={brief}
              maxLength={4000}
              placeholder={meta.briefPlaceholder}
              aria-describedby={describedBy("ai-brief", { error: errors.brief })}
              aria-invalid={Boolean(errors.brief)}
              onChange={(e) => setBrief(e.target.value)}
            />
          </Field>

          <fieldset className="space-y-2">
            <legend className="text-[13px] font-medium text-fg-secondary">
              Platforms{task === "adapt" ? "" : <span className="ml-1.5 font-normal text-fg-faint">Optional</span>}
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map((p) => {
                const on = platforms.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={on}
                    onClick={() => togglePlatform(p)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400",
                      on ? "border-gold-400/40 bg-gold-wash text-gold-200" : "border-line text-fg-muted hover:text-fg",
                    )}
                  >
                    <PlatformIcon platform={p} className="size-3.5" />
                    {PLATFORM_META[p].name}
                  </button>
                );
              })}
            </div>
            {errors.platforms ? <p className="text-xs text-danger">{errors.platforms[0]}</p> : null}
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <Field id="ai-tone" label="Tone">
              <Select id="ai-tone" value={tone} onChange={(e) => setTone(e.target.value as (typeof AI_TONES)[number])}>
                {AI_TONES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
            {task === "adapt" ? (
              <Field id="ai-language" label="Language">
                <Input id="ai-language" value={language} maxLength={40} onChange={(e) => setLanguage(e.target.value)} />
              </Field>
            ) : (
              <Field id="ai-count" label="How many">
                <Input
                  id="ai-count"
                  type="number"
                  min={1}
                  max={15}
                  value={count}
                  onChange={(e) => setCount(Math.max(1, Math.min(15, Number(e.target.value) || 1)))}
                />
              </Field>
            )}
          </div>
          <div className={cn("grid gap-3", task === "adapt" ? "grid-cols-1" : "grid-cols-2")}>
            <Field id="ai-audience" label="Audience" optional>
              <Input id="ai-audience" value={audience} maxLength={300} placeholder="e.g. design-minded homeowners" onChange={(e) => setAudience(e.target.value)} />
            </Field>
            {task === "adapt" ? null : (
              <Field id="ai-language" label="Language">
                <Input id="ai-language" value={language} maxLength={40} onChange={(e) => setLanguage(e.target.value)} />
              </Field>
            )}
          </div>

          {failure ? <Alert tone="danger">{failure}</Alert> : null}

          <Button type="button" className="w-full" onClick={generate} loading={pending} disabled={brief.trim().length < 3}>
            <Sparkles /> {mode.kind === "demo" ? "Generate demo output" : "Generate"}
          </Button>
          <p className="text-xs leading-relaxed text-fg-muted">
            {mode.kind === "demo"
              ? "Demo mode builds output from templates and your words. No AI model is called."
              : "Your brief is sent to Anthropic's API from our server. Review everything before publishing; nothing is posted automatically."}
          </p>
        </CardContent>
      </Card>

      <div className="min-w-0 space-y-6">
        <section aria-live="polite" aria-busy={pending} className="space-y-4">
          {pending ? (
            <Card>
              <CardContent className="space-y-3" aria-label="Generating">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-md bg-surface-raised" />
                ))}
              </CardContent>
            </Card>
          ) : active ? (
            <GenerationView generation={active} slug={slug} canCreatePost={canCreatePost} onCopied={() => toast.show({ tone: "success", title: "Copied" })} />
          ) : (
            <EmptyState icon={Sparkles} title="Nothing generated yet" description="Describe what you need on the left. Results stay in this workspace's history." />
          )}
        </section>

        {results.length > 1 ? (
          <Card>
            <CardHeader title="Recent" description="This workspace's last generations" />
            <ul className="divide-y divide-line">
              {results.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(g.id)}
                    aria-current={g.id === activeId ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-raised/60",
                      g.id === activeId && "bg-surface-raised/60",
                    )}
                  >
                    <History aria-hidden="true" className="size-4 shrink-0 text-fg-faint" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-fg">{g.input.brief}</span>
                      <span className="block text-xs text-fg-muted">
                        {AI_TASK_META[g.task].label} · {formatRelative(g.createdAt, new Date())}
                        {g.author ? ` · ${g.author}` : ""}
                      </span>
                    </span>
                    <ProviderBadge generation={g} />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function ProviderBadge({ generation }: { generation: Generation }) {
  return generation.isDemoOutput ? (
    <Badge tone="demo">
      <FlaskConical aria-hidden="true" /> Demo · no AI
    </Badge>
  ) : (
    <Badge tone="silver" title={generation.model ?? undefined}>
      <Sparkles aria-hidden="true" /> {generation.model ?? "AI"}
    </Badge>
  );
}

function GenerationView({
  generation,
  slug,
  canCreatePost,
  onCopied,
}: {
  generation: Generation;
  slug: string;
  canCreatePost: boolean;
  onCopied: () => void;
}) {
  return (
    <Card>
      <CardHeader
        title={AI_TASK_META[generation.task].label}
        description={generation.input.brief.length > 140 ? `${generation.input.brief.slice(0, 140)}…` : generation.input.brief}
        actions={<ProviderBadge generation={generation} />}
      />
      <CardContent className="space-y-3">
        {generation.isDemoOutput ? (
          <Alert tone="demo" title="Demo output">
            Built from templates and the words in your brief. No AI model produced this text.
          </Alert>
        ) : null}
        <ol className="space-y-3">
          {generation.output.items.map((item, index) => (
            <li key={index} className="rounded-lg border border-line bg-surface-raised/40 p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-2xs tabular-nums text-fg-faint">{String(index + 1).padStart(2, "0")}</span>
                {item.title ? <span className="text-[13px] font-medium text-fg">{item.title}</span> : null}
                {item.platform ? (
                  <Badge tone="neutral">
                    <PlatformIcon platform={item.platform} className="size-3" /> {PLATFORM_META[item.platform].name}
                  </Badge>
                ) : null}
              </div>
              {item.body ? <p className="whitespace-pre-line text-[13px] leading-relaxed text-fg-secondary">{item.body}</p> : null}
              {item.hashtags.length ? (
                <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs text-silver-300">
                  {item.hashtags.map((h) => (
                    <span key={h}>#{h}</span>
                  ))}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <CopyButton text={[item.body, item.hashtags.map((h) => `#${h}`).join(" ")].filter(Boolean).join("\n\n")} onCopied={onCopied} />
                {canCreatePost && generation.task !== "hashtags" ? (
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/w/${slug}/content/new?from=${generation.id}&item=${index}`}>
                      <FilePlus2 /> Start a post
                    </Link>
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        {generation.output.notes && !generation.isDemoOutput ? <p className="text-xs leading-relaxed text-fg-muted">{generation.output.notes}</p> : null}
      </CardContent>
    </Card>
  );
}

function CopyButton({ text, onCopied }: { text: string; onCopied: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          onCopied();
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard access can be blocked; the text stays selectable.
        }
      }}
    >
      {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
    </Button>
  );
}
