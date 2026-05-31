"use client";

/**
 * Globally-mounted achievement celebration queue for the web app.
 * Polls /api/achievements/pending on mount + on window focus, plays
 * each pending UserAchievement through CelebrationModal sequentially.
 *
 * Self-gates on next-auth session — renders null when unauthenticated
 * so anonymous landing pages don't 401-poll.
 */

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { CelebrationModal } from "./CelebrationModal";

type PendingItem = {
  id: string;
  achievement: {
    slug: string;
    title: string;
    description: string;
  };
};

export function CelebrationMount() {
  const { status } = useSession();
  const [queue, setQueue] = useState<PendingItem[]>([]);
  const inFlightRef = useRef(false);
  const lastFetchRef = useRef(0);

  const refresh = useCallback(async () => {
    if (status !== "authenticated") return;
    if (inFlightRef.current) return;
    const now = Date.now();
    if (now - lastFetchRef.current < 2000) return;
    lastFetchRef.current = now;
    inFlightRef.current = true;
    try {
      const res = await fetch("/api/achievements/pending", {
        credentials: "include",
      });
      if (!res.ok) return;
      const body = (await res.json()) as { items: PendingItem[] };
      if (body.items.length === 0) return;
      setQueue((prev) => {
        const existing = new Set(prev.map((p) => p.id));
        const next = body.items.filter((i) => !existing.has(i.id));
        return next.length === 0 ? prev : [...prev, ...next];
      });
    } catch {
      /* non-fatal */
    } finally {
      inFlightRef.current = false;
    }
  }, [status]);

  // Mount + window focus.
  useEffect(() => {
    if (status !== "authenticated") return;
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [status, refresh]);

  const current = queue[0] ?? null;

  const dismiss = useCallback(async () => {
    if (!current) return;
    const id = current.id;
    setQueue((prev) => prev.slice(1));
    try {
      await fetch(`/api/achievements/${id}/seen`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* worst case: re-fetch will resurface it on next pass */
    }
  }, [current]);

  if (!current) return null;
  return (
    <CelebrationModal
      slug={current.achievement.slug}
      title={current.achievement.title}
      description={current.achievement.description}
      onDismiss={dismiss}
    />
  );
}
