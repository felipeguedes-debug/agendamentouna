import { useTransition, type FormEvent } from "react";

/**
 * React 19 resets a form's uncontrolled fields once its action finishes, even when
 * the action only returns an error to show. This submit handler runs the action
 * itself, so what the person typed stays in the form; `action` comes from
 * useActionState. Keep `action` on the form too: without JavaScript it still posts.
 */
export function useSubmitKeepingValues(action: (formData: FormData) => void) {
  const [, startTransition] = useTransition();
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => action(formData));
  };
}
