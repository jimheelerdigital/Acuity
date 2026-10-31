/**
 * Ripple Creators is its own product surface (2026-10-31, Keenan): a creator
 * who also has a Ripple account must not see the app's sidebar, top nav,
 * crisis bar, install banner, achievement pop-ups or keyboard shortcuts on
 * the creator dashboard. Every piece of global app chrome checks this.
 */
const CREATOR_PREFIXES = ["/creators", "/creator-desk"];

export function isCreatorSurface(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return CREATOR_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
