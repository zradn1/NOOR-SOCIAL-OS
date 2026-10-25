"use client";

import { useActionState, useTransition, type FormEvent } from "react";

/**
 * useActionState for forms, without React 19's automatic field reset.
 *
 * The returned props keep `action` so the form still works without
 * JavaScript, while `onSubmit` dispatches manually (preventDefault stops
 * React's built-in submission), so a validation error doesn't wipe what the
 * user typed.
 */
export function useActionForm<State>(
  action: (previous: State, form: FormData) => Promise<State>,
  initialState: Awaited<State>,
) {
  const [state, dispatch, pending] = useActionState(action, initialState);
  const [, startTransition] = useTransition();
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(event.currentTarget, submitter instanceof HTMLElement ? submitter : undefined);
    startTransition(() => dispatch(data));
  };
  return [state, { action: dispatch, onSubmit }, pending] as const;
}
