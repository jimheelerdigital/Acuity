/**
 * Fire-and-forget onboarding funnel event. Never throws, never blocks.
 * Used by both the post-signup FirstDebriefFlow and the TryDebriefFlow.
 */
export function trackOnboardingEvent(
  event: string,
  sessionToken?: string | null
): void {
  try {
    const body: Record<string, string> = { event };
    if (sessionToken) body.sessionToken = sessionToken;

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
