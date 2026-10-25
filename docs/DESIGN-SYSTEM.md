# Design system

The identity is quiet luxury applied to a data product. Deep black and charcoal
surfaces, ivory type, silver hairlines, and a restrained champagne-gold accent.
Decoration never competes with data. Visit `/styleguide` in development, or set
`ENABLE_STYLEGUIDE=true` in a production build, to see every component.

## Tokens (`src/app/globals.css`)

| Group | Tokens | Notes |
| --- | --- | --- |
| Surfaces | `canvas` `sunken` `surface` `surface-raised` `surface-overlay` `surface-hover` | Each step is one shade lighter. Cards sit on `surface`; menus and dialogs on `surface-overlay` |
| Lines | `line` `line-strong` `line-focus` | Hairlines are ivory at 8–14% alpha, so they adapt to any surface |
| Type | `fg` `fg-secondary` `fg-muted` `fg-faint` | Ivory `#f4efe4` instead of white reduces glare. Contrast on `surface`: 16.4 / 9.9 / 5.4 |
| Silver | `silver-100…700` | Icons, metallic hairlines, brand wordmark |
| Gold | `gold-100…600`, `gold-ink`, `gold-wash` | Champagne. **UI accent only.** Primary buttons, focus ring, active navigation |
| Status | `success` `warning` `danger` `info` (+ `-wash`) | Always paired with an icon and a label |
| Demo | `demo` `demo-wash` `demo-line` + `demo-hatch` utility | Reserved for "not real data". Never used for anything else |
| Data viz | `viz-gold`, `viz-<platform>`, `viz-grid`, `viz-axis` | See below |

Typography: **Instrument Serif** for page titles and marketing display text only.
**Geist Sans** for all UI text and every number, including hero figures.
**Geist Mono** for identifiers. Tables and axes use tabular figures.
Standalone figures stay proportional.

Motion: Framer Motion for toasts and small entrances. `MotionConfig
reducedMotion="user"` plus a global `prefers-reduced-motion` rule disable
non-essential animation.

## Data visualization

Charts follow the dataviz method:

- **Platform colors** are fixed per platform (color follows the entity). They were
  chosen from validated reference steps by enumerating every assignment and
  keeping only those that pass all gates on the `#121211` card surface.
  Worst adjacent CVD ΔE is 9.4 (target ≥ 8), worst normal-vision ΔE is 20.9
  (floor 15), and every mark is ≥ 3:1 contrast.

  | Instagram | TikTok | Facebook | YouTube | LinkedIn | X | Pinterest |
  | --- | --- | --- | --- | --- | --- | --- |
  | `#d95926` | `#199e70` | `#3987e5` | `#e66767` | `#9085e9` | `#008300` | `#d55181` |

- **Single-series charts** use `#c98500`. Champagne `#c9a46a` fails the chroma
  floor (C 0.087 < 0.10) and lightness band (L 0.74 > 0.67) for data marks, so it
  stays a UI color.
- 2px lines, area fills at a ~10% wash, hairline solid grid, ≤ 24px bars with a
  4px rounded data end, and no dual axes.
- A crosshair tooltip lists every series (values lead). A legend appears for ≥ 2
  series. Every chart has a **table view** toggle.
- Missing values are gaps, never zeros. Unavailable metrics say "Unavailable"
  with a reason.
- Every metric shows its **provenance** (`DataSourceBadge`): Demo data, Imported,
  Platform API, or Unavailable. Freshness is shown with `FreshnessIndicator`.

## Components (`src/components`)

| Component | File |
| --- | --- |
| Button (primary, secondary, outline, ghost, danger, link; loading) | `ui/button.tsx` |
| Input, Textarea, Select (native), Checkbox | `ui/input.tsx` |
| Field, Label (hint and error wiring for `aria-describedby`) | `ui/field.tsx` |
| Card, CardHeader, CardContent, CardFooter | `ui/card.tsx` |
| Badge, StatusDot | `ui/badge.tsx` |
| Alert (info, success, warning, danger, demo, neutral) | `ui/alert.tsx` |
| Dialog (Radix) | `ui/dialog.tsx` |
| DropdownMenu (Radix) | `ui/dropdown-menu.tsx` |
| Tabs (Radix), NavTabs (route-backed) | `ui/tabs.tsx` |
| Table primitives | `ui/table.tsx` |
| EmptyState, ErrorState, Skeleton, PageSkeleton | `ui/states.tsx` |
| Tooltip, Toast, Avatar, Spinner, PageHeader, Breadcrumbs | `ui/*` |
| StatTile, DataSourceBadge, FreshnessIndicator | `data/*` |
| ChartFrame, TimeSeriesChart, BarListChart | `charts/*` |
| PlatformIcon, PlatformBadgeIcon | `platform/platform-icon.tsx` |
| DemoBanner, DemoBadge | `demo/demo-indicators.tsx` |
