/**
 * Fire-and-forget onboarding funnel event. Never throws, never blocks.
 * Used by both the post-signup FirstDebriefFlow and the TryDebriefFlow.
 *
 * For post-signup events, pass userId (from server component prop) so
 * the event can be stored even if the NextAuth session cookie hasn't
 * propagated to the client yet.
 */
export function trackOnboardingEvent(
  event: string,
  opts?: { sessionToken?: string | null; userId?: string | null }
): void {
  try {
    const body: Record<string, string> = { event };
    if (opts?.sessionToken) body.sessionToken = opts.sessionToken;
    if (opts?.userId) body.userId = opts.userId;

    // eslint-disable-next-line no-console
    console.log(`[onboarding-track] ${event}`, opts?.userId ? `user:${opts.userId}` : opts?.sessionToken ? `session:${opts.sessionToken}` : "anon");

    fetch("/api/onboarding-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // keepalive ensures the request completes even if the page navigates away
      keepalive: true,
    }).catch(() => {
      // Swallow — analytics should never break the user flow
    });
  } catch {
    // Swallow
  }
}
