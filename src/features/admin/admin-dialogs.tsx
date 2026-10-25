"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { describedBy, Field } from "@/components/ui/field";
import { fieldError, FormMessage } from "@/components/ui/form-message";
import { Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useActionForm } from "@/components/ui/use-action-form";
import { assignPlanAction, setUserSuspendedAction } from "@/server/actions/admin";

function ReasonField({ error }: { error?: string[] | string }) {
  return (
    <Field id="admin-reason" label="Reason" hint="Recorded in the audit log." error={error}>
      <Textarea
        id="admin-reason"
        name="reason"
        rows={2}
        required
        minLength={4}
        maxLength={300}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy("admin-reason", { hint: true, error })}
      />
    </Field>
  );
}

function useCloseOnSuccess(state: { ok: boolean; message?: string } | null, close: () => void) {
  const toast = useToast();
  useEffect(() => {
    if (state?.ok) {
      toast.show({ tone: "success", title: state.message ?? "Saved" });
      close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

export function AssignPlanDialog({ organizationId, organizationName, planId }: { organizationId: string; organizationName: string; planId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formProps, pending] = useActionForm(assignPlanAction, null);
  useCloseOnSuccess(state, () => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Change plan
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Plan for ${organizationName}`}
        description="Assigns a plan without a payment provider, for invoiced customers or support credits. Organizations paying through Stripe change plans there."
        size="sm"
      >
        <form {...formProps} className="space-y-4">
          <FormMessage state={state?.ok ? null : state} />
          <input type="hidden" name="organizationId" value={organizationId} />
          <Field id="admin-plan" label="Plan">
            <Select id="admin-plan" name="planId" defaultValue={planId}>
              <option value="free">Free</option>
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="agency">Agency</option>
            </Select>
          </Field>
          <ReasonField error={fieldError(state, "reason")} />
          <Button type="submit" className="w-full" loading={pending}>
            Assign plan
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SuspendUserDialog({ userId, email, suspended }: { userId: string; email: string; suspended: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, formProps, pending] = useActionForm(setUserSuspendedAction, null);
  useCloseOnSuccess(state, () => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          {suspended ? "Restore" : "Suspend"}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={suspended ? `Restore ${email}?` : `Suspend ${email}?`}
        description={
          suspended
            ? "They can sign in again and regain their existing access."
            : "They are signed out on their next request and can't sign in. Their organizations and content stay as they are."
        }
        size="sm"
      >
        <form {...formProps} className="space-y-4">
          <FormMessage state={state?.ok ? null : state} />
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="suspended" value={suspended ? "false" : "true"} />
          <ReasonField error={fieldError(state, "reason")} />
          <Button type="submit" variant={suspended ? "primary" : "danger"} className="w-full" loading={pending}>
            {suspended ? "Restore access" : "Suspend user"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
