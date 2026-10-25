"use client";

import { Hand, Plus, Unplug } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { describedBy, Field } from "@/components/ui/field";
import { fieldError, FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { useActionForm } from "@/components/ui/use-action-form";
import { PLATFORM_META, type Platform } from "@/lib/platforms/registry";
import { addDemoAccountAction, addManualAccountAction, disconnectAccountAction } from "@/server/actions/accounts";

export function DisconnectButton({
  slug,
  accountId,
  name,
  mode,
}: {
  slug: string;
  accountId: string;
  name: string;
  mode: "disconnect" | "remove";
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const verb = mode === "disconnect" ? "Disconnect" : "Remove";
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Unplug /> {verb}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`${verb} ${name}?`}
        description={
          mode === "disconnect"
            ? "Stored tokens are erased and revoked at the platform where it supports revocation. Posts queued for this account will be blocked."
            : "The account and its imported or simulated history are removed from this workspace."
        }
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await disconnectAccountAction(slug, accountId);
                  if (!result.ok) toast.show({ tone: "error", title: result.error.message });
                  else if (result.data.revocationNote)
                    toast.show({ tone: "info", title: `${name} disconnected`, description: result.data.revocationNote });
                  else toast.show({ tone: "success", title: `${name} ${mode === "disconnect" ? "disconnected" : "removed"}` });
                })
              }
            >
              {verb}
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-fg-secondary">This action is recorded in the audit log.</p>
      </DialogContent>
    </Dialog>
  );
}

export function AddDemoAccountButton({ slug, platform }: { slug: string; platform: Platform }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await addDemoAccountAction(slug, platform);
          toast.show(
            result.ok
              ? { tone: "success", title: result.message ?? "Demo account added" }
              : { tone: "error", title: result.error.message },
          );
        })
      }
    >
      <Plus /> Add demo account
    </Button>
  );
}

export function ConnectButton({ slug, platform, enabled, reason }: { slug: string; platform: Platform; enabled: boolean; reason: string }) {
  const name = PLATFORM_META[platform].name;
  if (!enabled) {
    return (
      <Tooltip content={reason}>
        <span tabIndex={0} className="inline-flex">
          <Button size="sm" disabled aria-disabled="true">
            Connect {name}
          </Button>
        </span>
      </Tooltip>
    );
  }
  return (
    <form action={`/api/integrations/${platform}/authorize`} method="post">
      <input type="hidden" name="workspace" value={slug} />
      <Button size="sm" type="submit">
        Connect {name}
      </Button>
    </form>
  );
}

export function TrackManuallyDialog({ slug, platform }: { slug: string; platform: Platform }) {
  const [open, setOpen] = useState(false);
  const [state, formProps, pending] = useActionForm(addManualAccountAction.bind(null, slug), null);
  const name = PLATFORM_META[platform].name;
  const nameError = fieldError(state, "displayName");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Hand /> Track manually
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Track a ${name} account manually`}
        description="For importing analytics you export from the platform. The account is not connected: NOOR stores no credentials for it and cannot publish to it."
      >
        {state?.ok ? (
          <div className="space-y-4">
            <FormMessage state={state} />
            <Button variant="secondary" className="w-full" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        ) : (
          <form {...formProps} className="space-y-4">
            <FormMessage state={state} />
            <input type="hidden" name="platform" value={platform} />
            <Field id={`manual-name-${platform}`} label="Account name" error={nameError}>
              <Input
                id={`manual-name-${platform}`}
                name="displayName"
                placeholder={`Our ${name}`}
                aria-invalid={Boolean(nameError)}
                aria-describedby={describedBy(`manual-name-${platform}`, { error: nameError })}
              />
            </Field>
            <Field id={`manual-handle-${platform}`} label="Handle" optional>
              <Input id={`manual-handle-${platform}`} name="handle" placeholder="@handle" />
            </Field>
            <Button type="submit" className="w-full" loading={pending}>
              Add for manual tracking
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
