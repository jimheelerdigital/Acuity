"use client";

import { PageError } from "@/components/page-error";

export default function LifeMatrixError({
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
      title="Couldn't load your Life Matrix"
      message="The radar isn't responding. Try again, or come back in a minute."
    />
  );
}
