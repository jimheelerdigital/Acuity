"use client";

import { PageError } from "@/components/page-error";

export default function EntriesError({
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
      title="Couldn't load your entries"
      message="The journal isn't responding. Try again, or come back in a minute — your recordings are safe."
    />
  );
}
