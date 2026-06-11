"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  type ReactNode,
} from "react";
import { toast } from "sonner";

/**
 * App-level tracker for entries still processing after a recording (Phase 2/3
 * web fallback — no Web Push until v1.4). Survives navigation, unlike the
 * per-component useEntryPolling, so when a background-processed entry reaches
 * COMPLETE/FAILED while the user is on a DIFFERENT page, we fire a sonner
 * toast that taps through to the entry. (Minor known tradeoff: if the user
 * stays on the record page, the inline result + this toast can both show —
 * both correct; the toast is dismissible.)
 */
type PendingEntriesCtx = { trackEntry: (entryId: string) => void };

const PendingEntriesContext = createContext<PendingEntriesCtx>({
  trackEntry: () => {},
});

export function usePendingEntries(): PendingEntriesCtx {
  return useContext(PendingEntriesContext);
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_MS = 3 * 60 * 1000; // matches useEntryPolling's wall-clock cap
const TERMINAL = new Set(["COMPLETE", "PARTIAL", "FAILED"]);

export function PendingEntriesProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const trackedRef = useRef<Set<string>>(new Set());

  const trackEntry = useCallback(
    (entryId: string) => {
      if (!entryId || trackedRef.current.has(entryId)) return;
      trackedRef.current.add(entryId);
      const startedAt = Date.now();

      const poll = async () => {
        if (!trackedRef.current.has(entryId)) return;
        try {
          const res = await fetch(`/api/entries/${entryId}`, {
            cache: "no-store",
          });
          if (res.ok) {
            const data = (await res.json()) as { status?: string };
            const status = data.status ?? "";
            if (TERMINAL.has(status)) {
              trackedRef.current.delete(entryId);
              const open = {
                label: "Open",
                onClick: () => router.push(`/entries/${entryId}`),
              };
              if (status === "FAILED") {
                toast.error("We couldn't finish your recording", {
                  description: "Your audio is saved — tap to try again.",
                  action: open,
                });
              } else {
                toast.success("Your insights are ready", {
                  description: "Tap to see what we found.",
                  action: open,
                });
              }
              return;
            }
          }
        } catch {
          // transient — keep polling until the deadline
        }
        if (Date.now() - startedAt > MAX_POLL_MS) {
          trackedRef.current.delete(entryId);
          return;
        }
        window.setTimeout(poll, POLL_INTERVAL_MS);
      };

      window.setTimeout(poll, POLL_INTERVAL_MS);
    },
    [router]
  );

  return (
    <PendingEntriesContext.Provider value={{ trackEntry }}>
      {children}
    </PendingEntriesContext.Provider>
  );
}
