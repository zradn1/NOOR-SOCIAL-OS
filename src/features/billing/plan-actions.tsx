"use client";

import { ExternalLink } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { openBillingPortalAction, startCheckoutAction } from "@/server/actions/billing";

/** Sends the browser to Stripe Checkout. Nothing is charged or changed until Stripe confirms. */
export function CheckoutButton({ slug, planId, label }: { slug: string; planId: string; label: string }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  return (
    <Button
      className="w-full"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await startCheckoutAction(slug, planId);
          if (result.ok) window.location.assign(result.data.url);
          else toast.show({ tone: "error", title: result.error.message });
        })
      }
    >
      {label}
    </Button>
  );
}

export function PortalButton({ slug, label = "Manage billing", variant = "secondary" }: { slug: string; label?: string; variant?: "secondary" | "ghost" }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  return (
    <Button
      variant={variant}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await openBillingPortalAction(slug);
          if (result.ok) window.location.assign(result.data.url);
          else toast.show({ tone: "error", title: result.error.message });
        })
      }
    >
      {label} <ExternalLink />
    </Button>
  );
}
