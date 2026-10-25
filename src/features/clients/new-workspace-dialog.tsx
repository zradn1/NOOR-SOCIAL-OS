"use client";

import { Briefcase, Building2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { describedBy, Field } from "@/components/ui/field";
import { fieldError, FormMessage } from "@/components/ui/form-message";
import { Input, Textarea } from "@/components/ui/input";
import { useActionForm } from "@/components/ui/use-action-form";
import { TimeZoneSelect } from "@/features/settings/settings-forms";
import { cn } from "@/lib/utils/cn";
import { createWorkspaceAction } from "@/server/actions/clients";

export function NewWorkspaceDialog({
  slug,
  zones,
  defaultTimezone,
  clientsAllowed,
  defaultKind = "client",
}: {
  slug: string;
  zones: string[];
  defaultTimezone: string;
  clientsAllowed: boolean;
  defaultKind?: "client" | "internal";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"client" | "internal">(clientsAllowed ? defaultKind : "internal");
  const [state, formProps, pending] = useActionForm(createWorkspaceAction.bind(null, slug), null);
  const nameError = fieldError(state, "name");

  useEffect(() => {
    if (state?.ok) router.push(`/w/${state.data.slug}/dashboard`);
  }, [state, router]);

  const options = [
    { value: "client" as const, icon: Briefcase, title: "Client", body: "A brand you manage for someone else. Can invite client guests on Agency." },
    { value: "internal" as const, icon: Building2, title: "Own brand", body: "A brand your team runs itself." },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> New workspace
        </Button>
      </DialogTrigger>
      <DialogContent title="New workspace" description="Each workspace has its own accounts, content, calendar, and analytics." size="md">
        <form {...formProps} className="space-y-5">
          <FormMessage state={state?.ok ? null : state} />
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium text-fg-secondary">Type</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {options.map((o) => {
                const disabled = o.value === "client" && !clientsAllowed;
                return (
                  <label
                    key={o.value}
                    className={cn(
                      "relative flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold-400",
                      kind === o.value ? "border-gold-400/40 bg-gold-wash" : "border-line hover:border-line-strong",
                      disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <input
                      type="radio"
                      name="kind"
                      value={o.value}
                      checked={kind === o.value}
                      disabled={disabled}
                      onChange={() => setKind(o.value)}
                      className="sr-only"
                    />
                    <o.icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-silver-300" />
                    <span>
                      <span className="block text-[13px] font-medium text-fg">{o.title}</span>
                      <span className="block text-xs leading-relaxed text-fg-muted">
                        {disabled ? "Client workspaces are part of the Pro and Agency plans." : o.body}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <Field id="ws-name" label="Name" error={nameError}>
            <Input
              id="ws-name"
              name="name"
              required
              minLength={2}
              maxLength={80}
              placeholder={kind === "client" ? "e.g. Maison Lumière" : "e.g. Noor Studio"}
              aria-invalid={Boolean(nameError)}
              aria-describedby={describedBy("ws-name", { error: nameError })}
            />
          </Field>
          <Field id="ws-timezone" label="Time zone" hint="Schedules and the calendar use this zone.">
            <TimeZoneSelect id="ws-timezone" value={defaultTimezone} zones={zones} />
          </Field>
          <Field id="ws-description" label="About this brand" optional hint="Shown to the AI Assistant as brand context. Up to 280 characters.">
            <Textarea id="ws-description" name="description" rows={3} maxLength={280} />
          </Field>
          <Button type="submit" className="w-full" loading={pending || Boolean(state?.ok)}>
            Create workspace
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
