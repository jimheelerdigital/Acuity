"use client";

import { PageError } from "@/components/page-error";

export default function AdminError({
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
      title="Admin dashboard couldn't load"
      message="One of the metric queries failed. Try again, or check Vercel logs for the route that crashed."
      backHref="/home"
      backLabel="Back to app"
    />
  );
}
