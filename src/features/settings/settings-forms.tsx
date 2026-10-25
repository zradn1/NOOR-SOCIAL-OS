"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useActionForm } from "@/components/ui/use-action-form";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { describedBy, Field } from "@/components/ui/field";
import { fieldError, FormMessage } from "@/components/ui/form-message";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  deleteWorkspaceAction,
  renameOrganizationAction,
  updateProfileAction,
  updateWorkspaceAction,
} from "@/server/actions/settings";

function TimeZoneSelect({ id, value, zones, disabled }: { id: string; value: string; zones: string[]; disabled?: boolean }) {
  return (
    <Select id={id} name="timezone" defaultValue={value} disabled={disabled}>
      {zones.map((tz) => (
        <option key={tz} value={tz}>
          {tz.replaceAll("_", " ")}
        </option>
      ))}
    </Select>
  );
}

export function ProfileForm({
  fullName,
  email,
  timezone,
  zones,
}: {
  fullName: string;
  email: string;
  timezone: string;
  zones: string[];
}) {
  const [state, formProps, pending] = useActionForm(updateProfileAction, null);
  const nameError = fieldError(state, "fullName");
  return (
    <Card>
      <CardHeader title="Profile" description="How you appear to your team." />
      <form {...formProps}>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormMessage state={state} />
          </div>
          <Field id="fullName" label="Full name" error={nameError}>
            <Input
              id="fullName"
              name="fullName"
              defaultValue={fullName}
              aria-invalid={Boolean(nameError)}
              aria-describedby={describedBy("fullName", { error: nameError })}
            />
          </Field>
          <Field id="email" label="Email" hint="Managed by your sign-in provider.">
            <Input id="email" value={email} readOnly disabled aria-describedby="email-hint" />
          </Field>
          <Field id="timezone" label="Your time zone" error={fieldError(state, "timezone")}>
            <TimeZoneSelect id="timezone" value={timezone} zones={zones} />
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" loading={pending}>
            Save profile
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export function WorkspaceSettingsForm({
  slug,
  name,
  timezone,
  description,
  zones,
  canEdit,
}: {
  slug: string;
  name: string;
  timezone: string;
  description: string;
  zones: string[];
  canEdit: boolean;
}) {
  const [state, formProps, pending] = useActionForm(updateWorkspaceAction.bind(null, slug), null);
  const nameError = fieldError(state, "name");
  const descError = fieldError(state, "description");
  return (
    <Card>
      <CardHeader
        title="Workspace details"
        description={canEdit ? "Name, time zone, and description for this workspace." : "Only workspace admins can change these."}
      />
      <form {...formProps}>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormMessage state={state} />
          </div>
          <Field id="ws-name" label="Name" error={nameError}>
            <Input
              id="ws-name"
              name="name"
              defaultValue={name}
              disabled={!canEdit}
              aria-invalid={Boolean(nameError)}
              aria-describedby={describedBy("ws-name", { error: nameError })}
            />
          </Field>
          <Field id="ws-timezone" label="Time zone" hint="The calendar and schedules use this zone.">
            <TimeZoneSelect id="ws-timezone" value={timezone} zones={zones} disabled={!canEdit} />
          </Field>
          <Field id="ws-description" label="Description" optional error={descError} className="sm:col-span-2">
            <Textarea
              id="ws-description"
              name="description"
              defaultValue={description}
              maxLength={280}
              disabled={!canEdit}
              aria-invalid={Boolean(descError)}
            />
          </Field>
        </CardContent>
        {canEdit ? (
          <CardFooter className="justify-end">
            <Button type="submit" loading={pending}>
              Save changes
            </Button>
          </CardFooter>
        ) : null}
      </form>
    </Card>
  );
}

export function DeleteWorkspaceCard({ slug, name, isDemo }: { slug: string; name: string; isDemo: boolean }) {
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  return (
    <Card className="border-danger/25">
      <CardHeader
        title={isDemo ? "Delete demo workspace" : "Delete workspace"}
        description="Removes the workspace and its content from everyone's view. Scheduled posts are cancelled. This is logged in the audit trail."
      />
      <CardFooter className="justify-end">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="danger">Delete workspace</Button>
          </DialogTrigger>
          <DialogContent
            title={`Delete ${name}?`}
            description="Type the workspace name to confirm."
            footer={
              <>
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <Button
                  variant="danger"
                  disabled={confirm !== name}
                  loading={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await deleteWorkspaceAction(slug);
                      if (result && !result.ok) toast.show({ tone: "error", title: result.error.message });
                    })
                  }
                >
                  Delete permanently
                </Button>
              </>
            }
          >
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={name} aria-label="Workspace name" />
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
}

export function OrganizationNameForm({ slug, name }: { slug: string; name: string }) {
  const [state, formProps, pending] = useActionForm(renameOrganizationAction.bind(null, slug), null);
  return (
    <Card>
      <CardHeader title="Organization" description="Shown to everyone in your organization and on invitations." />
      <form {...formProps}>
        <CardContent className="space-y-4">
          <FormMessage state={state} />
          <Field id="org-name" label="Organization name" error={fieldError(state, "name")}>
            <Input id="org-name" name="name" defaultValue={name} />
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" loading={pending}>
            Save
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
