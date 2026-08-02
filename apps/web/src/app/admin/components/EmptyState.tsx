"use client";

export default function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-acuity-lg border border-acuity-card-border bg-acuity-card-bg p-12 text-center text-sm text-acuity-text-ter">
      {message}
    </div>
  );
}
