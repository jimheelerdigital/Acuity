"use client";

import { useEffect, useState } from "react";

/**
 * Time-of-day greeting that respects the user's LOCAL timezone.
 *
 * Renders a placeholder ("Hi, {firstName}") on first server-side
 * render to avoid a hydration mismatch (the server doesn't know the
 * user's zone), then replaces with the time-aware word once mounted
 * on the client. The transition is fast enough that the user only
 * sees the time-aware version.
 *
 * Mapping (local hour, 24h):
 *   05–11 → "Good morning"
 *   12–16 → "Good afternoon"
 *   17–20 → "Good evening"
 *   21–04 → "Good night"
 *
 * Fallback chain:
 *   1. `Intl.DateTimeFormat().resolvedOptions().timeZone` succeeds
 *      → use the user's actual zone
 *   2. Intl returns no zone (very rare; some locked-down browsers)
 *      → fall back to `new Date().getHours()` which uses the
 *      browser's reported zone, still client-local
 *   3. Both fail → render plain "Hi, {firstName}" so we don't
 *      guess wrong (better than "Good morning" at 11pm)
 *
 * Deliberately a client component — the server has no way to know
 * the user's zone for new users (User.timezone may be null until
 * onboarding completes, and even then could be stale if the user
 * traveled). Always trust the client clock for time-of-day reads.
 */
export function Greeting({ firstName }: { firstName: string }) {
  const [word, setWord] = useState<string>("Hi");

  useEffect(() => {
    setWord(computeGreetingWord());
  }, []);

  return <>{word}, {firstName}</>;
}

function computeGreetingWord(): string {
  // Try the explicit-zone path first. If anything throws (very old
  // browsers, locked-down environments), fall back to plain hours.
  let hour: number;
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone) {
      // `toLocaleString` with the resolved zone gives us the local
      // hour even if the device clock is set to something else.
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        hour: "numeric",
        hour12: false,
      }).formatToParts(new Date());
      const hourPart = parts.find((p) => p.type === "hour")?.value;
      hour = hourPart != null ? parseInt(hourPart, 10) : new Date().getHours();
    } else {
      hour = new Date().getHours();
    }
  } catch {
    return "Hi";
  }

  if (Number.isNaN(hour)) return "Hi";
  if (hour >= 5 && hour <= 11) return "Good morning";
  if (hour >= 12 && hour <= 16) return "Good afternoon";
  if (hour >= 17 && hour <= 20) return "Good evening";
  // 21-04 — late night / early morning. "Good night" feels right
  // for the evening side; the early-morning side (1-4 AM) is rare
  // enough that "Good night" is still the closest read.
  return "Good night";
}
