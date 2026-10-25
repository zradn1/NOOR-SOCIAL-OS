import { NoorLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <NoorLogo />
      <div className="space-y-2">
        <p className="eyebrow">404</p>
        <h1 className="font-display text-4xl text-fg">This page isn&apos;t here</h1>
        <p className="text-sm text-fg-muted">It may have moved, or you may not have access to it.</p>
      </div>
      <Button asChild variant="secondary">
        <a href="/app">Back to NOOR</a>
      </Button>
    </main>
  );
}
