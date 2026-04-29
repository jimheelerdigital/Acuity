"use client";

import { PageError } from "@/components/page-error";

export default function TasksError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageError
      reset={reset}
      digest={error.digest}
      title="Couldn't load your tasks"
      message="The tasks list isn't responding. Try again, or come back in a minute."
    />
  );
}
