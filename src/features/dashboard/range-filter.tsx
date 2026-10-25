import Link from "next/link";
import { RANGE_PRESETS, type RangePreset } from "@/lib/analytics/aggregate";
import { PLATFORM_META, PLATFORMS, type Platform } from "@/lib/platforms/registry";
import { cn } from "@/lib/utils/cn";
import { PlatformIcon } from "@/components/platform/platform-icon";

const LABEL: Record<RangePreset, string> = { "7d": "7 days", "30d": "30 days", "90d": "90 days" };

function href(base: string, params: Record<string, string | undefined>) {
  const qs = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])));
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

/** Date range and platform filters in one row above everything they scope. */
export function FilterBar({
  basePath,
  range,
  platforms,
  available,
}: {
  basePath: string;
  range: RangePreset;
  platforms: Platform[] | null;
  available: Platform[];
}) {
  const platformParam = platforms?.join(",");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="group" aria-label="Date range" className="inline-flex rounded-lg border border-line bg-sunken p-1">
        {(Object.keys(RANGE_PRESETS) as RangePreset[]).map((preset) => (
          <Link
            key={preset}
            href={href(basePath, { range: preset, platforms: platformParam })}
            aria-current={preset === range ? "true" : undefined}
            className={cn(
              "inline-flex h-7 items-center rounded-md px-3 text-[13px] font-medium transition-colors",
              preset === range ? "bg-surface-raised text-fg shadow-[var(--shadow-card)]" : "text-fg-muted hover:text-fg",
            )}
          >
            {LABEL[preset]}
          </Link>
        ))}
      </div>
      {available.length > 1 ? (
        <div role="group" aria-label="Platforms" className="flex flex-wrap items-center gap-1.5">
          <Link
            href={href(basePath, { range })}
            aria-current={!platforms ? "true" : undefined}
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-3 text-xs transition-colors",
              !platforms ? "border-gold-400/40 bg-gold-wash text-gold-200" : "border-line text-fg-muted hover:text-fg",
            )}
          >
            All platforms
          </Link>
          {PLATFORMS.filter((p) => available.includes(p)).map((p) => {
            const active = platforms?.includes(p) ?? false;
            const next = active ? (platforms ?? []).filter((x) => x !== p) : [...(platforms ?? []), p];
            return (
              <Link
                key={p}
                href={href(basePath, { range, platforms: next.length ? next.join(",") : undefined })}
                aria-pressed={active}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
                  active ? "border-gold-400/40 bg-gold-wash text-gold-200" : "border-line text-fg-muted hover:text-fg",
                )}
              >
                <PlatformIcon platform={p} className="size-3.5" />
                {PLATFORM_META[p].name}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function parseRange(value: unknown): RangePreset {
  return value === "7d" || value === "90d" ? value : "30d";
}

export function parsePlatforms(value: unknown): Platform[] | null {
  if (typeof value !== "string" || !value) return null;
  const list = value.split(",").filter((p): p is Platform => (PLATFORMS as readonly string[]).includes(p));
  return list.length ? [...new Set(list)] : null;
}
