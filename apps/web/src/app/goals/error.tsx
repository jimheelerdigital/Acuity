"use client";

import { PageError } from "@/components/page-error";

export default function GoalsError({
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
      title="Couldn't load your goals"
      message="The goals view isn't responding. Try again, or come back in a minute."
    />
  );
}
