import type { Metadata } from "next";
import { Suspense } from "react";
import { NoorLogo } from "@/components/brand/logo";
import { Skeleton } from "@/components/ui/states";
import { OnboardingForm } from "@/features/onboarding/onboarding-form";
import { listTimeZones } from "@/lib/time/timezones";
import { identityOf, requireUser } from "@/server/auth/session";
import { listAccessibleWorkspaces } from "@/server/services/organizations";

export const metadata: Metadata = { title: "Set up your workspace" };

async function OnboardingContent() {
  const user = await requireUser("/onboarding");
  const existing = await listAccessibleWorkspaces(identityOf(user));
  return (
    <>
      <OnboardingForm timeZones={listTimeZones()} />
      {existing.length > 0 ? (
        <p className="text-center text-[13px] text-fg-muted">
          Already a member somewhere?{" "}
          <a href="/app" className="text-gold-300 hover:text-gold-200">
            Go to your workspace
          </a>
        </p>
      ) : null}
    </>
  );
}

export default function OnboardingPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <NoorLogo />
        <div className="space-y-2">
          <p className="eyebrow">Step 1 of 1</p>
          <h1 className="font-display text-[2.25rem] leading-tight text-fg">Set up your organization</h1>
          <p className="text-sm leading-relaxed text-fg-muted">
            You can add client workspaces, invite your team, and explore a clearly labelled demo workspace afterwards.
          </p>
        </div>
        <Suspense fallback={<Skeleton className="h-80 w-full" />}>
          <OnboardingContent />
        </Suspense>
      </div>
    </main>
  );
}
