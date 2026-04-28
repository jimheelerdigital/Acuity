"use client";

import { useRouter } from "next/navigation";

import { EntryDeleteButton } from "@/components/entry-delete-button";

/**
 * Detail-page wrapper around EntryDeleteButton: on success, route the
 * user back to /entries so they don't sit on a now-404 detail page.
 */
export function EntryDeleteButtonWithRedirect({
  entryId,
}: {
  entryId: string;
}) {
  const router = useRouter();
  return (
    <EntryDeleteButton
      entryId={entryId}
      variant="button"
      onDeleted={() => {
        router.replace("/entries");
        router.refresh();
      }}
    />
  );
}
