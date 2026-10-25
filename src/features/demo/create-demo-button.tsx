"use client";

import { FlaskConical } from "lucide-react";
import { useTransition } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createDemoWorkspaceAction } from "@/server/actions/accounts";

export function CreateDemoWorkspaceButton({ slug, variant = "secondary" }: { slug: string; variant?: ButtonProps["variant"] }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  return (
    <Button
      variant={variant}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await createDemoWorkspaceAction(slug);
          if (result && !result.ok) toast.show({ tone: "error", title: result.error.message });
        })
      }
    >
      <FlaskConical /> Explore a demo workspace
    </Button>
  );
}
