/**
 * Legendary Mythicals site (2026-10-01): legendarymythicals.com is served by
 * this Next app. next.config.js rewrites (beforeFiles, host match) serve that host from /lm/*, and the same
 * pages are reachable at goripple.io/lm for testing. Links inside the site
 * use basePathFor(host): "" on the Mythicals domain, "/lm" elsewhere.
 */

export const MYTHICALS_HOSTS = ["legendarymythicals.com", "www.legendarymythicals.com"];

export function isMythicalsHost(host: string | null | undefined): boolean {
  const h = (host ?? "").split(":")[0].toLowerCase();
  return MYTHICALS_HOSTS.includes(h);
}

export function basePathFor(host: string | null | undefined): string {
  return isMythicalsHost(host) ? "" : "/lm";
}

/** Canonical public origin for links in emails and OG tags. */
export const MYTHICALS_ORIGIN = "https://legendarymythicals.com";

/**
 * True on the Mythicals surface in the browser (either the domain or the
 * /lm test path). Used to keep Ripple-only UI and trackers off these pages.
 */
export function isMythicalsSurface(pathname?: string | null): boolean {
  if (pathname?.startsWith("/lm")) return true;
  if (typeof window !== "undefined") return isMythicalsHost(window.location.hostname);
  return false;
}

export const PORTRAIT_PRICE_CENTS = 1200;

export function shopLive(): boolean {
  return process.env.MYTHICALS_SHOP_LIVE === "1";
}
