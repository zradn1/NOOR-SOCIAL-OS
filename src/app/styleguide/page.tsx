import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoorLogo } from "@/components/brand/logo";
import { DataSourceBadge } from "@/components/data/data-source-badge";
import { StatTile } from "@/components/data/stat-tile";
import { DemoBadge, DemoBanner } from "@/components/demo/demo-indicators";
import { PlatformBadgeIcon } from "@/components/platform/platform-icon";
import { Alert } from "@/components/ui/alert";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PLATFORMS, PLATFORM_META } from "@/lib/platforms/registry";
import { StyleguideCharts, StyleguideInteractive } from "./interactive";

export const metadata: Metadata = { title: "Design system" };

function guardStyleguide() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_STYLEGUIDE !== "true") notFound();
}

const swatches = [
  ["canvas", "bg-canvas"],
  ["sunken", "bg-sunken"],
  ["surface", "bg-surface"],
  ["surface-raised", "bg-surface-raised"],
  ["surface-overlay", "bg-surface-overlay"],
  ["fg", "bg-fg"],
  ["fg-secondary", "bg-fg-secondary"],
  ["fg-muted", "bg-fg-muted"],
  ["silver-300", "bg-silver-300"],
  ["silver-500", "bg-silver-500"],
  ["gold-300", "bg-gold-300"],
  ["gold-400", "bg-gold-400"],
  ["demo", "bg-demo"],
  ["success", "bg-success"],
  ["warning", "bg-warning"],
  ["danger", "bg-danger"],
] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="eyebrow">{title}</h2>
      {children}
    </section>
  );
}

export default function StyleguidePage() {
  guardStyleguide();
  return (
    <div className="min-h-dvh">
      <DemoBanner />
      <main className="mx-auto max-w-6xl space-y-14 px-4 py-10 sm:px-8">
        <div className="flex items-center justify-between">
          <NoorLogo />
          <Badge tone="silver">Design system v1</Badge>
        </div>

        <PageHeader
          eyebrow="Foundations"
          title="Quiet luxury, legible data"
          description="Deep charcoal surfaces, ivory type, silver hairlines, and a restrained champagne accent. Numbers always state where they came from."
          breadcrumbs={[{ label: "Noor Studio", href: "/" }, { label: "Design system" }]}
          actions={
            <>
              <Button variant="secondary">Secondary</Button>
              <Button>Primary action</Button>
            </>
          }
        />

        <Section title="Color tokens">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {swatches.map(([name, cls]) => (
              <div key={name} className="space-y-2">
                <div className={`h-14 rounded-md border border-line-strong ${cls}`} />
                <p className="font-mono text-2xs text-fg-muted">{name}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Typography">
          <div className="space-y-3">
            <p className="font-display text-5xl text-fg">Your audience, in one light.</p>
            <p className="font-display text-3xl text-fg-secondary italic">Display · Instrument Serif</p>
            <p className="text-lg font-medium text-fg">Heading · Geist Sans 18 / Medium</p>
            <p className="max-w-2xl text-sm leading-relaxed text-fg-secondary">
              Body · Geist Sans 14. Interfaces for agencies are read all day; we favour generous line height,
              restrained contrast for secondary text, and ivory over pure white to reduce glare on black.
            </p>
            <p className="eyebrow">Eyebrow label</p>
            <p className="font-mono text-xs text-fg-muted">Mono · job_7f3a9c · idempotency key</p>
          </div>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Disconnect</Button>
            <Button variant="link">Link</Button>
            <Button loading>Saving</Button>
            <Button disabled>Disabled</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
          </div>
        </Section>

        <Section title="Badges & status">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Draft</Badge>
            <Badge tone="gold">Pro plan</Badge>
            <Badge tone="silver">Viewer</Badge>
            <Badge tone="info">
              <StatusDot /> Scheduled
            </Badge>
            <Badge tone="success">
              <StatusDot /> Published
            </Badge>
            <Badge tone="warning">
              <StatusDot /> Retrying
            </Badge>
            <Badge tone="danger">
              <StatusDot /> Failed
            </Badge>
            <DemoBadge />
            <DataSourceBadge source="demo" />
            <DataSourceBadge source="manual_import" />
            <DataSourceBadge source="provider_sync" />
            <DataSourceBadge source="unavailable" />
          </div>
        </Section>

        <Section title="Platforms">
          <div className="flex flex-wrap gap-3">
            {PLATFORMS.map((p) => (
              <div key={p} className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2">
                <PlatformBadgeIcon platform={p} size="sm" />
                <span className="text-[13px] text-fg-secondary">{PLATFORM_META[p].name}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Alerts">
          <div className="grid gap-3 lg:grid-cols-2">
            <Alert tone="info" title="Integration not configured">
              Instagram publishing requires an approved Meta app. Nothing will be posted until it is set up.
            </Alert>
            <Alert tone="demo" title="Demo workspace">
              Metrics here are synthetic and exist only to explore the product.
            </Alert>
            <Alert tone="success" title="Draft saved">
              Your caption and hashtags are stored.
            </Alert>
            <Alert tone="danger" title="Publishing failed">
              The provider rejected the media format. Review and retry.
            </Alert>
          </div>
        </Section>

        <Section title="Form controls">
          <Card>
            <CardHeader title="New post" description="Fields validate on the server as well as here." />
            <CardContent className="grid gap-5 md:grid-cols-2">
              <Field id="sg-title" label="Internal title" hint="Only your team sees this.">
                <Input id="sg-title" placeholder="Autumn collection teaser" />
              </Field>
              <Field id="sg-platform" label="Platform">
                <Select id="sg-platform" defaultValue="instagram">
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {PLATFORM_META[p].name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="sg-caption" label="Caption" error="Caption exceeds 280 characters for X." className="md:col-span-2">
                <Textarea id="sg-caption" aria-invalid="true" defaultValue="A caption that is too long…" />
              </Field>
              <label className="flex items-center gap-2 text-[13px] text-fg-secondary">
                <Checkbox defaultChecked /> Add first comment
              </label>
            </CardContent>
            <CardFooter>
              <span className="text-xs text-fg-muted">Autosaved 2 minutes ago</span>
              <div className="flex gap-2">
                <Button variant="ghost">Cancel</Button>
                <Button>Save draft</Button>
              </div>
            </CardFooter>
          </Card>
        </Section>

        <Section title="Stat tiles">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Followers" value={128_430} source="demo" delta={{ value: 2_140, period: "vs prior 30 days" }} />
            <StatTile label="Engagement rate" value={0.0412} format="percent" source="manual_import" delta={{ value: -0.004, period: "vs prior 30 days" }} />
            <StatTile label="Reach" value={null} source="unavailable" unavailableReason="X does not expose reach for this account tier." />
            <StatTile label="Posts published" value={0} source="provider_sync" />
          </div>
        </Section>

        <Section title="Charts (sample data for the style guide)">
          <StyleguideCharts />
        </Section>

        <Section title="Table">
          <Card>
            <Table>
              <THead>
                <tr>
                  <TH>Account</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Followers</TH>
                </tr>
              </THead>
              <TBody>
                <TR>
                  <TD className="text-fg">@maison.noor</TD>
                  <TD>
                    <DemoBadge />
                  </TD>
                  <TD className="text-right">48,210</TD>
                </TR>
                <TR>
                  <TD className="text-fg">Noor Atelier</TD>
                  <TD>
                    <Badge tone="warning">
                      <StatusDot /> Not configured
                    </Badge>
                  </TD>
                  <TD className="text-right text-fg-faint">—</TD>
                </TR>
              </TBody>
            </Table>
          </Card>
        </Section>

        <Section title="Overlays, menus, tabs, toasts">
          <StyleguideInteractive />
        </Section>

        <Section title="Empty, error, loading">
          <div className="grid gap-4 lg:grid-cols-2">
            <EmptyState
              icon={Inbox}
              title="No scheduled posts"
              description="Drafts you schedule appear here with their target platforms."
              action={<Button size="sm">Create post</Button>}
            />
            <ErrorState reference="err_4f9a2c" action={<Button size="sm" variant="secondary">Try again</Button>} />
          </div>
          <PageSkeleton cards={4} />
        </Section>
      </main>
    </div>
  );
}
