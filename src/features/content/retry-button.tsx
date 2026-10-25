"use client";

import { RotateCcw } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { retryJobAction } from "@/server/actions/content";

export function RetryJobButton({ slug, jobId, unknownOutcome }: { slug: string; jobId: string; unknownOutcome: boolean }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={() => {
        if (unknownOutcome && !window.confirm("The platform never confirmed the first attempt. Check that the post isn't already live before retrying. Retry now?")) return;
        startTransition(async () => {
          const result = await retryJobAction(slug, jobId);
          toast.show(result.ok ? { tone: "success", title: result.message ?? "Queued" } : { tone: "error", title: result.error.message });
        });
      }}
    >
      <RotateCcw /> Retry
    </Button>
  );
}
