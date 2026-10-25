"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useActionForm } from "@/components/ui/use-action-form";
import { describedBy, Field } from "@/components/ui/field";
import { fieldError, FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import {
  forgotPasswordAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
} from "@/server/actions/auth";

export function SignInForm({ next }: { next?: string }) {
  const [state, formProps, pending] = useActionForm(signInAction, null);
  const emailError = fieldError(state, "email");
  const passwordError = fieldError(state, "password");
  return (
    <form {...formProps} className="space-y-5" noValidate>
      <FormMessage state={state} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field id="email" label="Email" error={emailError}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(emailError)}
          aria-describedby={describedBy("email", { error: emailError })}
        />
      </Field>
      <Field id="password" label="Password" error={passwordError}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(passwordError)}
          aria-describedby={describedBy("password", { error: passwordError })}
        />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-xs text-fg-muted transition-colors hover:text-gold-300">
          Forgot your password?
        </Link>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Sign in
      </Button>
    </form>
  );
}

export function SignUpForm() {
  const [state, formProps, pending] = useActionForm(signUpAction, null);
  if (state?.ok && state.data.needsConfirmation) {
    return <FormMessage state={state} />;
  }
  const nameError = fieldError(state, "fullName");
  const emailError = fieldError(state, "email");
  const passwordError = fieldError(state, "password");
  return (
    <form {...formProps} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <Field id="fullName" label="Full name" error={nameError}>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          aria-invalid={Boolean(nameError)}
          aria-describedby={describedBy("fullName", { error: nameError })}
        />
      </Field>
      <Field id="email" label="Work email" error={emailError}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(emailError)}
          aria-describedby={describedBy("email", { error: emailError })}
        />
      </Field>
      <Field
        id="password"
        label="Password"
        hint="At least 10 characters, with a letter and a number."
        error={passwordError}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(passwordError)}
          aria-describedby={describedBy("password", { hint: true, error: passwordError })}
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Create account
      </Button>
      <p className="text-center text-xs leading-relaxed text-fg-muted">
        We never ask for your social media passwords. Accounts are connected only through each platform&apos;s
        official authorization screen.
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, formProps, pending] = useActionForm(forgotPasswordAction, null);
  const emailError = fieldError(state, "email");
  return (
    <form {...formProps} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <Field id="email" label="Email" error={emailError}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(emailError)}
          aria-describedby={describedBy("email", { error: emailError })}
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Send reset link
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, formProps, pending] = useActionForm(resetPasswordAction, null);
  const passwordError = fieldError(state, "password");
  const confirmError = fieldError(state, "confirmPassword");
  return (
    <form {...formProps} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <Field id="password" label="New password" hint="At least 10 characters, with a letter and a number." error={passwordError}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(passwordError)}
          aria-describedby={describedBy("password", { hint: true, error: passwordError })}
        />
      </Field>
      <Field id="confirmPassword" label="Confirm new password" error={confirmError}>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(confirmError)}
          aria-describedby={describedBy("confirmPassword", { error: confirmError })}
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Update password
      </Button>
    </form>
  );
}
