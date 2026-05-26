/**
 * Fire-and-forget onboarding funnel event. Never throws, never blocks.
 * Used by both the post-signup FirstDebriefFlow and the TryDebriefFlow.
 *
 * For post-signup events, pass userId (from server component prop) so
 * the event can be stored even if the NextAuth session cookie hasn't
 * propagated to the client yet.
 */

export interface UtmParams {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  fbclid?: string;
}

export function trackOnboardingEvent(
  event: string,
  opts?: {
    sessionToken?: string | null;
    userId?: string | null;
    value?: string | null;
    values?: unknown;
    utm?: UtmParams;
  }
): void {
  try {
    const body: Record<string, string> = { event };
    if (opts?.sessionToken) body.sessionToken = opts.sessionToken;
    if (opts?.userId) body.userId = opts.userId;
    // Store diagnostic answer values — flatten arrays to comma-separated string
    if (opts?.value != null) body.value = String(opts.value);
    else if (opts?.values != null) body.value = Array.isArray(opts.values) ? opts.values.join(", ") : String(opts.values);
    // UTM attribution
    if (opts?.utm) {
      if (opts.utm.utmSource) body.utmSource = opts.utm.utmSource;
      if (opts.utm.utmMedium) body.utmMedium = opts.utm.utmMedium;
      if (opts.utm.utmCampaign) body.utmCampaign = opts.utm.utmCampaign;
      if (opts.utm.utmContent) body.utmContent = opts.utm.utmContent;
      if (opts.utm.utmTerm) body.utmTerm = opts.utm.utmTerm;
      if (opts.utm.fbclid) body.fbclid = opts.utm.fbclid;
    }

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

/**
 * Capture UTM params from the current URL and store in sessionStorage.
 * Called once on /start mount. Returns the captured params (or previously
 * stored ones if the URL no longer has UTMs — e.g. after step navigation).
 */
const UTM_STORAGE_KEY = "acuity_funnel_utm";

export function captureUtmParams(): UtmParams {
  if (typeof window === "undefined") return {};

  // Check sessionStorage first (UTMs captured on initial page load)
  try {
    const stored = sessionStorage.getItem(UTM_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as UtmParams;
      // If URL has fresh UTMs, override stored ones
      const fresh = readUtmsFromUrl();
      if (fresh.utmSource || fresh.fbclid) {
        const merged = { ...parsed, ...fresh };
        sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(merged));
        return merged;
      }
      return parsed;
    }
  } catch {}

  // First visit — read from URL and store
  const params = readUtmsFromUrl();
  if (params.utmSource || params.fbclid) {
    try {
      sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(params));
    } catch {}
  }
  return params;
}

function readUtmsFromUrl(): UtmParams {
  if (typeof window === "undefined") return {};
  const sp = new URLSearchParams(window.location.search);
  const params: UtmParams = {};
  if (sp.get("utm_source")) params.utmSource = sp.get("utm_source")!;
  if (sp.get("utm_medium")) params.utmMedium = sp.get("utm_medium")!;
  if (sp.get("utm_campaign")) params.utmCampaign = sp.get("utm_campaign")!;
  if (sp.get("utm_content")) params.utmContent = sp.get("utm_content")!;
  if (sp.get("utm_term")) params.utmTerm = sp.get("utm_term")!;
  if (sp.get("fbclid")) params.fbclid = sp.get("fbclid")!;
  return params;
}
