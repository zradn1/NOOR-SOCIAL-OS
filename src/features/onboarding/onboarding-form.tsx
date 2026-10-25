"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useActionForm } from "@/components/ui/use-action-form";
import { describedBy, Field } from "@/components/ui/field";
import { fieldError, FormMessage } from "@/components/ui/form-message";
import { Input, Select } from "@/components/ui/input";
import { createOrganizationAction } from "@/server/actions/onboarding";

export function OnboardingForm({ timeZones }: { timeZones: string[] }) {
  const [state, formProps, pending] = useActionForm(createOrganizationAction, null);
  const [browserZone] = useState(() =>
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC",
  );
  const orgError = fieldError(state, "organizationName");
  const wsError = fieldError(state, "workspaceName");
  const tzError = fieldError(state, "timezone");
  return (
    <form {...formProps} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <Field
        id="organizationName"
        label="Organization"
        hint="Your agency, company, or creator name. Billing and team live here."
        error={orgError}
      >
        <Input
          id="organizationName"
          name="organizationName"
          placeholder="Maison Noor"
          required
          aria-invalid={Boolean(orgError)}
          aria-describedby={describedBy("organizationName", { hint: true, error: orgError })}
        />
      </Field>
      <Field
        id="workspaceName"
        label="First workspace"
        hint="A workspace holds one brand's accounts, content, and analytics."
        error={wsError}
      >
        <Input
          id="workspaceName"
          name="workspaceName"
          placeholder="Main brand"
          required
          aria-invalid={Boolean(wsError)}
          aria-describedby={describedBy("workspaceName", { hint: true, error: wsError })}
        />
      </Field>
      <Field id="timezone" label="Time zone" hint="Used for the calendar and scheduling." error={tzError}>
        <Select
          id="timezone"
          name="timezone"
          defaultValue={timeZones.includes(browserZone) ? browserZone : "UTC"}
          aria-describedby={describedBy("timezone", { hint: true, error: tzError })}
        >
          {timeZones.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replaceAll("_", " ")}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Create workspace
      </Button>
    </form>
  );
}
