"use client";

import { PageError } from "@/components/page-error";

export default function ThemeMapError({
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
      title="Couldn't load Theme Map"
      message="The theme aggregation isn't responding. Try again, or come back in a minute."
    />
  );
}
