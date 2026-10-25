"use client";

import { Copy, MailPlus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useActionForm } from "@/components/ui/use-action-form";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { describedBy, Field } from "@/components/ui/field";
import { fieldError, FormMessage } from "@/components/ui/form-message";
import { Checkbox, Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { assignableRoles, ROLE_DESCRIPTION, ROLE_LABEL, WORKSPACE_ROLES, type Role } from "@/lib/auth/permissions";
import { formatRelative } from "@/lib/utils/format";
import {
  changeMemberRoleAction,
  inviteMemberAction,
  removeMemberAction,
  revokeInvitationAction,
  setWorkspaceAssignmentAction,
} from "@/server/actions/settings";
import type { InvitationSummary, OrganizationMember, WorkspaceAccessRow } from "@/server/services/members";

function useActionToast() {
  const toast = useToast();
  return (result: { ok: boolean; message?: string; error?: { message: string } }) => {
    if (result.ok) {
      if (result.message) toast.show({ tone: "success", title: result.message });
    } else toast.show({ tone: "error", title: result.error?.message ?? "Something went wrong." });
  };
}

export function OrganizationMembersTable({
  slug,
  members,
  currentUserId,
  actorRole,
}: {
  slug: string;
  members: OrganizationMember[];
  currentUserId: string;
  actorRole: Role;
}) {
  const [pending, startTransition] = useTransition();
  const report = useActionToast();
  const roles = assignableRoles(actorRole);
  const ownerCount = members.filter((m) => m.role === "owner").length;
  return (
    <Card>
      <CardHeader title="Members" description="Organization roles. Owners and admins can open every workspace." />
      <Table className="mt-4">
        <THead>
          <tr>
            <TH>Member</TH>
            <TH>Role</TH>
            <TH className="hidden md:table-cell">Workspaces</TH>
            <TH className="text-right">
              <span className="sr-only">Actions</span>
            </TH>
          </tr>
        </THead>
        <TBody>
          {members.map((m) => {
            const isSelf = m.userId === currentUserId;
            const editable = !isSelf && roles.includes(m.role) && !m.isClientGuest;
            const removable = !isSelf && roles.includes(m.role);
            // The last owner can't leave; ownership must be transferred first.
            const canLeave = isSelf && !(m.role === "owner" && ownerCount === 1);
            return (
              <TR key={m.userId}>
                <TD>
                  <div className="flex items-center gap-3">
                    <Avatar name={m.fullName || m.email} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-fg">
                        {m.fullName || m.email}
                        {isSelf ? <span className="ml-1.5 text-xs text-fg-muted">(you)</span> : null}
                      </p>
                      <p className="truncate text-xs text-fg-muted">{m.email}</p>
                    </div>
                  </div>
                </TD>
                <TD>
                  {m.isClientGuest ? (
                    <Badge tone="info" title="Access to one client workspace only">
                      Client guest
                    </Badge>
                  ) : editable ? (
                    <Select
                      aria-label={`Role for ${m.email}`}
                      defaultValue={m.role}
                      disabled={pending}
                      className="h-8 w-36 text-[13px]"
                      onChange={(e) =>
                        startTransition(async () =>
                          report(await changeMemberRoleAction(slug, { userId: m.userId, role: e.target.value })),
                        )
                      }
                    >
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Badge tone={m.role === "owner" ? "gold" : "silver"}>{ROLE_LABEL[m.role]}</Badge>
                  )}
                </TD>
                <TD className="hidden md:table-cell">
                  {m.role === "owner" || m.role === "admin" ? "All" : m.workspaceCount}
                </TD>
                <TD className="text-right">
                  {removable || canLeave ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={isSelf ? "Leave organization" : `Remove ${m.email}`}
                      disabled={pending}
                      onClick={() => {
                        const question = isSelf
                          ? "Leave this organization? You'll lose access to its workspaces."
                          : `Remove ${m.email} from the organization?`;
                        if (!window.confirm(question)) return;
                        startTransition(async () => report(await removeMemberAction(slug, m.userId)));
                      }}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </Card>
  );
}

export function InvitationsCard({
  slug,
  invitations,
  workspaces,
  actorRole,
}: {
  slug: string;
  invitations: InvitationSummary[];
  workspaces: { id: string; name: string }[];
  actorRole: Role;
}) {
  const [pending, startTransition] = useTransition();
  const report = useActionToast();
  const now = new Date();
  return (
    <Card>
      <CardHeader
        title="Invitations"
        description="Invitation links are single-use and expire after 7 days."
        actions={<InviteDialog slug={slug} workspaces={workspaces} actorRole={actorRole} />}
      />
      <div className="p-5 pt-4">
        {invitations.length === 0 ? (
          <EmptyState compact title="No pending invitations" description="Invite teammates or clients to collaborate." />
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-fg">{inv.email}</p>
                  <p className="text-xs text-fg-muted">
                    {inv.clientGuest ? "Client guest" : ROLE_LABEL[inv.role]}
                    {inv.workspaceCount ? ` · ${inv.workspaceCount} workspace${inv.workspaceCount > 1 ? "s" : ""}` : ""} · expires{" "}
                    {formatRelative(inv.expiresAt, now)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => startTransition(async () => report(await revokeInvitationAction(slug, inv.id)))}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function InviteDialog({
  slug,
  workspaces,
  actorRole,
}: {
  slug: string;
  workspaces: { id: string; name: string }[];
  actorRole: Role;
}) {
  const [state, formProps, pending] = useActionForm(inviteMemberAction.bind(null, slug), null);
  const [role, setRole] = useState<Role>("editor");
  const [copied, setCopied] = useState(false);
  const roles = assignableRoles(actorRole).filter((r) => r !== "owner");
  const needsWorkspaces = role !== "admin";
  const emailError = fieldError(state, "email");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm">
          <MailPlus /> Invite
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Invite to organization"
        description="No email provider is configured, so copy the link and send it yourself. It is shown only once."
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
            <p className="text-xs text-fg-muted">
              The recipient must sign in with the invited email address to accept.
            </p>
            <DialogClose asChild>
              <Button variant="ghost" className="w-full">
                Done
              </Button>
            </DialogClose>
          </div>
        ) : (
          <form {...formProps} className="space-y-5">
            <FormMessage state={state} />
            <Field id="invite-email" label="Email" error={emailError}>
              <Input
                id="invite-email"
                name="email"
                type="email"
                required
                aria-invalid={Boolean(emailError)}
                aria-describedby={describedBy("invite-email", { error: emailError })}
              />
            </Field>
            <Field id="invite-role" label="Organization role" hint={ROLE_DESCRIPTION[role]}>
              <Select id="invite-role" name="role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>
            {needsWorkspaces ? (
              <fieldset className="space-y-3">
                <legend className="text-[13px] font-medium text-fg-secondary">Workspace access</legend>
                <p className="text-xs text-fg-muted">
                  Non-admin members only see workspaces they are explicitly assigned to.
                </p>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-line p-3 scrollbar-thin">
                  {workspaces.map((w) => (
                    <label key={w.id} className="flex items-center gap-2 text-[13px] text-fg-secondary">
                      <Checkbox name="workspaceIds" value={w.id} /> {w.name}
                    </label>
                  ))}
                </div>
                <Field id="invite-ws-role" label="Role in those workspaces">
                  <Select id="invite-ws-role" name="workspaceRole" defaultValue="editor">
                    {WORKSPACE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </fieldset>
            ) : null}
            <Button type="submit" className="w-full" loading={pending}>
              Create invitation link
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function WorkspaceAccessTable({
  slug,
  rows,
  canManage,
  currentUserId,
}: {
  slug: string;
  rows: WorkspaceAccessRow[];
  canManage: boolean;
  currentUserId: string;
}) {
  const [pending, startTransition] = useTransition();
  const report = useActionToast();
  return (
    <Card>
      <CardHeader
        title="Who can open this workspace"
        description="Organization owners and admins always have access. Everyone else needs an explicit assignment."
      />
      <Table className="mt-4">
        <THead>
          <tr>
            <TH>Member</TH>
            <TH className="hidden sm:table-cell">Organization role</TH>
            <TH>Workspace access</TH>
          </tr>
        </THead>
        <TBody>
          {rows.map((r) => {
            const inherited = r.orgRole === "owner" || r.orgRole === "admin";
            return (
              <TR key={r.userId}>
                <TD>
                  <div className="flex items-center gap-3">
                    <Avatar name={r.fullName || r.email} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-fg">{r.fullName || r.email}</p>
                      <p className="truncate text-xs text-fg-muted">{r.email}</p>
                    </div>
                  </div>
                </TD>
                <TD className="hidden sm:table-cell">{r.isClientGuest ? "Client guest" : ROLE_LABEL[r.orgRole]}</TD>
                <TD>
                  {inherited ? (
                    <Badge tone="gold">{ROLE_LABEL[r.orgRole]} · inherited</Badge>
                  ) : canManage && r.userId !== currentUserId ? (
                    <Select
                      aria-label={`Workspace access for ${r.email}`}
                      defaultValue={r.workspaceRole ?? ""}
                      disabled={pending}
                      className="h-8 w-40 text-[13px]"
                      onChange={(e) =>
                        startTransition(async () =>
                          report(
                            await setWorkspaceAssignmentAction(slug, { userId: r.userId, role: e.target.value || null }),
                          ),
                        )
                      }
                    >
                      {r.isClientGuest ? null : <option value="">No access</option>}
                      {WORKSPACE_ROLES.filter((role) => !r.isClientGuest || role !== "admin").map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABEL[role]}
                        </option>
                      ))}
                    </Select>
                  ) : r.workspaceRole ? (
                    <Badge tone="silver">{ROLE_LABEL[r.workspaceRole]}</Badge>
                  ) : (
                    <span className="text-xs text-fg-faint">No access</span>
                  )}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </Card>
  );
}
