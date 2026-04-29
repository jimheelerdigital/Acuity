"use client";

import { PageError } from "@/components/page-error";

export default function HomeError({
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
      title="Couldn't load your dashboard"
      message="The data layer hiccupped. Try again, or come back in a minute — your entries and reports are safe."
      backHref="/auth/signin"
      backLabel="Sign out"
    />
  );
}
