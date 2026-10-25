"use client";

import { Copy, MailPlus, Trash2, UserRound } from "lucide-react";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { describedBy, Field } from "@/components/ui/field";
import { fieldError, FormMessage } from "@/components/ui/form-message";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { useActionForm } from "@/components/ui/use-action-form";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/auth/permissions";
import { formatRelative } from "@/lib/utils/format";
import { inviteClientGuestAction, removeClientGuestAction, revokeClientInvitationAction } from "@/server/actions/clients";
import { setWorkspaceAssignmentAction } from "@/server/actions/settings";
import type { ClientGuest, ClientGuestInvitation } from "@/server/services/clients";

const GUEST_ROLES = ["viewer", "analyst", "editor"] as const;

export function ClientGuestsCard({
  slug,
  workspaceName,
  guests,
  invitations,
  canManage,
  canInvite,
}: {
  slug: string;
  workspaceName: string;
  guests: ClientGuest[];
  invitations: ClientGuestInvitation[];
  canManage: boolean;
  /** The plan includes guest access (existing guests stay manageable after a downgrade). */
  canInvite: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const now = new Date();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: { message: string } }>) =>
    startTransition(async () => {
      const result = await fn();
      if (result.ok) toast.show({ tone: "success", title: result.message ?? "Done" });
      else toast.show({ tone: "error", title: result.error?.message ?? "Something went wrong." });
    });

  return (
    <Card>
      <CardHeader
        title="Client guests"
        description={`People from ${workspaceName}'s side. They only ever see this workspace, never your other clients or your team roster.`}
        actions={canManage && canInvite ? <InviteGuestDialog slug={slug} workspaceName={workspaceName} /> : null}
      />
      <CardContent className="space-y-4">
        {!canInvite && guests.length === 0 && invitations.length === 0 ? (
          <p className="rounded-md border border-line bg-surface-raised px-4 py-3 text-[13px] text-fg-muted">
            Guest access is part of the Agency plan. Your team can still work in this workspace as usual.
          </p>
        ) : guests.length === 0 && invitations.length === 0 ? (
          <EmptyState compact icon={UserRound} title="No guests yet" description="Invite a brand manager to review drafts and follow results." />
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line">
            {guests.map((g) => (
              <li key={g.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar name={g.fullName || g.email} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-fg">{g.fullName || g.email}</p>
                  <p className="truncate text-xs text-fg-muted">
                    {g.email} · joined {formatRelative(g.joinedAt, now)}
                  </p>
                </div>
                {canManage ? (
                  <Select
                    aria-label={`Access for ${g.email}`}
                    defaultValue={g.role}
                    disabled={pending}
                    className="h-8 w-32 text-[13px]"
                    onChange={(e) => run(() => setWorkspaceAssignmentAction(slug, { userId: g.userId, role: e.target.value }))}
                  >
                    {GUEST_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Badge tone="silver">{ROLE_LABEL[g.role]}</Badge>
                )}
                {canManage ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${g.email}`}
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm(`Remove ${g.email}? They lose access to ${workspaceName} immediately.`)) {
                        run(() => removeClientGuestAction(slug, g.userId));
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </li>
            ))}
            {invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="grid size-7 place-items-center rounded-full border border-dashed border-line-strong">
                  <MailPlus aria-hidden="true" className="size-3.5 text-fg-faint" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-fg">{inv.email}</p>
                  <p className="text-xs text-fg-muted">Invited · expires {formatRelative(inv.expiresAt, now)}</p>
                </div>
                <Badge tone="neutral">{ROLE_LABEL[inv.role]}</Badge>
                {canManage ? (
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => revokeClientInvitationAction(slug, inv.id))}>
                    Revoke
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function InviteGuestDialog({ slug, workspaceName }: { slug: string; workspaceName: string }) {
  const [state, formProps, pending] = useActionForm(inviteClientGuestAction.bind(null, slug), null);
  const [role, setRole] = useState<(typeof GUEST_ROLES)[number]>("viewer");
  const [copied, setCopied] = useState(false);
  const emailError = fieldError(state, "email");
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <MailPlus /> Invite guest
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Invite a guest to ${workspaceName}`}
        description="No email provider is configured, so copy the link and send it yourself. It is shown only once and expires in 7 days."
        size="md"
      >
        {state?.ok ? (
          <div className="space-y-4">
            <FormMessage state={{ ok: true, data: undefined, message: "Invitation created." }} />
            <div className="flex gap-2">
              <Input readOnly value={state.data.link} aria-label="Invitation link" className="font-mono text-xs" />
              <Button
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(state.data.link);
                  setCopied(true);
                }}
              >
                <Copy /> {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <DialogClose asChild>
              <Button variant="ghost" className="w-full">
                Done
              </Button>
            </DialogClose>
          </div>
        ) : (
          <form {...formProps} className="space-y-5">
            <FormMessage state={state} />
            <Field id="guest-email" label="Email" error={emailError}>
              <Input
                id="guest-email"
                name="email"
                type="email"
                required
                aria-invalid={Boolean(emailError)}
                aria-describedby={describedBy("guest-email", { error: emailError })}
              />
            </Field>
            <Field id="guest-role" label="Access" hint={ROLE_DESCRIPTION[role]}>
              <Select id="guest-role" name="role" value={role} onChange={(e) => setRole(e.target.value as (typeof GUEST_ROLES)[number])}>
                {GUEST_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="text-xs leading-relaxed text-fg-muted">Guests count toward your plan&apos;s member limit.</p>
            <Button type="submit" className="w-full" loading={pending}>
              Create invitation link
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
