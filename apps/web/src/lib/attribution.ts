/**
 * First-touch UTM attribution cookie.
 *
 * Set on first landing page visit, read at signup time.
 * 30-day expiry, path=/, first-touch only (never overwrites).
 */

const COOKIE_NAME = "acuity_attribution";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer?: string;
  landingPath?: string;
  ts?: number;
}

/**
 * Extract UTM params from URL search params.
 */
export function getAttributionFromSearchParams(
  searchParams: URLSearchParams
): Attribution {
  const attr: Attribution = {};
  const source = searchParams.get("utm_source");
  const medium = searchParams.get("utm_medium");
  const campaign = searchParams.get("utm_campaign");
  const content = searchParams.get("utm_content");
  const term = searchParams.get("utm_term");

  if (source) attr.utm_source = source;
  if (medium) attr.utm_medium = medium;
  if (campaign) attr.utm_campaign = campaign;
  if (content) attr.utm_content = content;
  if (term) attr.utm_term = term;

  return attr;
}

/**
 * Set the attribution cookie if not already present (first-touch).
 * Call from client components on landing pages.
 */
export function setAttributionCookie(overrides: Partial<Attribution> = {}) {
  if (typeof document === "undefined") return;

  // Don't overwrite existing attribution (first-touch model)
  if (document.cookie.includes(COOKIE_NAME + "=")) return;

  const params = new URLSearchParams(window.location.search);
  const attr: Attribution = {
    ...getAttributionFromSearchParams(params),
    referrer: document.referrer || undefined,
    landingPath: window.location.pathname,
    ts: Date.now(),
    ...overrides,
  };

  // Only set if there's meaningful data
  if (
    !attr.utm_source &&
    !attr.utm_medium &&
    !attr.utm_campaign &&
    !attr.referrer
  ) {
    // Still set with landingPath so we know they visited
    if (!attr.landingPath || attr.landingPath === "/") return;
  }

  const value = encodeURIComponent(JSON.stringify(attr));
  document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

/**
 * Read the attribution cookie from a cookie string (client or server).
 */
export function getAttributionFromCookie(
  cookieString: string
): Attribution | null {
  const match = cookieString.match(
    new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`)
  );
  if (!match) return null;

  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

/**
 * Read the attribution cookie from the browser document.cookie.
 */
export function getClientAttribution(): Attribution | null {
  if (typeof document === "undefined") return null;
  return getAttributionFromCookie(document.cookie);
}
