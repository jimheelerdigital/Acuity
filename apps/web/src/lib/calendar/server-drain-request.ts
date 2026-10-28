/**
 * Ask Inngest to drain a person's calendar queue on the server (2026-10-28).
 *
 * Only for server-executed providers (Google Calendar direct). Called right
 * after something is queued: a task marked PENDING, a dismissal queued for
 * deletion, a fresh connect. The Inngest function is debounced per user, so
 * a burst of task edits (or a recording that creates ten tasks) becomes one
 * run a few seconds later, after the caller's writes have committed. The
 * 30-min calendar cron sweeps anything a lost event missed.
 *
 * Never throws: the task mutation must succeed regardless.
 */

export const GOOGLE_DRAIN_EVENT = "calendar/google.drain-requested" as const;

export async function requestServerCalendarDrain(userId: string): Promise<void> {
  try {
    const { inngest } = await import("@/inngest/client");
    await inngest.send({ name: GOOGLE_DRAIN_EVENT, data: { userId } });
  } catch (err) {
    console.warn(
      "[calendar] server drain request failed (non-fatal; cron retries):",
      err instanceof Error ? err.message : err
    );
  }
}
