"use client";

import { ChevronDown, LogOut, Settings, User } from "lucide-react";
import { BarListChart } from "@/components/charts/bar-list-chart";
import { TimeSeriesChart, type TimePoint } from "@/components/charts/time-series-chart";
import { DataSourceBadge } from "@/components/data/data-source-badge";
import { PlatformIcon } from "@/components/platform/platform-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { PLATFORMS, PLATFORM_META, VIZ_SINGLE_SERIES } from "@/lib/platforms/registry";

// Deterministic sample series for the style guide only (not product data).
function sampleSeries(days: number): TimePoint[] {
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10);
    const point: TimePoint = { date, total: Math.round(42_000 + i * 310 + Math.sin(i / 3) * 900) };
    PLATFORMS.slice(0, 4).forEach((p, k) => {
      point[p] = i === 12 && k === 2 ? null : Math.round(9_000 + k * 6_000 + i * (60 + k * 25) + Math.cos(i / 4 + k) * 500);
    });
    return point;
  });
}

const data = sampleSeries(30);

export function StyleguideCharts() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <TimeSeriesChart
        title="Audience growth"
        description="Single series uses the validated gold step."
        data={data}
        series={[{ key: "total", label: "Followers", color: VIZ_SINGLE_SERIES }]}
        badge={<DataSourceBadge source="demo" />}
      />
      <TimeSeriesChart
        title="Followers by platform"
        description="Platform colors are fixed per platform. The gap on day 13 is missing data, not zero."
        data={data}
        series={PLATFORMS.slice(0, 4).map((p) => ({ key: p, label: PLATFORM_META[p].name, color: PLATFORM_META[p].vizColor }))}
        badge={<DataSourceBadge source="demo" />}
      />
      <BarListChart
        title="Engagement rate by platform"
        items={PLATFORMS.map((p, i) => ({
          key: p,
          label: PLATFORM_META[p].name,
          icon: <PlatformIcon platform={p} className="text-fg-muted" />,
          value: p === "x" ? null : 0.012 + i * 0.006,
          note: p === "x" ? "Not provided" : undefined,
        }))}
        format="percent"
        badge={<DataSourceBadge source="demo" />}
      />
    </div>
  );
}

export function StyleguideInteractive() {
  const toast = useToast();
  return (
    <div className="flex flex-wrap items-start gap-6">
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="secondary">Open dialog</Button>
        </DialogTrigger>
        <DialogContent
          title="Disconnect account?"
          description="Stored tokens are deleted and revoked at the provider where supported."
          footer={
            <>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button variant="danger">Disconnect</Button>
            </>
          }
        >
          <p className="text-[13px] leading-relaxed text-fg-secondary">
            Scheduled posts targeting this account will be blocked until it is reconnected.
          </p>
        </DialogContent>
      </Dialog>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            Account menu <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Signed in as amira@noor.studio</DropdownMenuLabel>
          <DropdownMenuItem>
            <User /> Profile
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Settings /> Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        onClick={() => toast.show({ tone: "success", title: "Draft saved", description: "Autumn collection teaser" })}
      >
        Show toast
      </Button>

      <Tabs defaultValue="month" className="space-y-3">
        <TabsList>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="week">Week</TabsTrigger>
        </TabsList>
        <TabsContent value="month" className="text-[13px] text-fg-muted">
          Month view content
        </TabsContent>
        <TabsContent value="week" className="text-[13px] text-fg-muted">
          Week view content
        </TabsContent>
      </Tabs>
    </div>
  );
}
