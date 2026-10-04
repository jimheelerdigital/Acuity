/**
 * Pages where ad/analytics trackers must never run (2026-10-03, weekly audit
 * R-09-26-3). The signed-in app is a journal: entries, moods, patterns,
 * crisis support. Loading the Meta Pixel there ties identified users
 * (advanced matching sends their email) to visits to a mental-reflection
 * product, the pattern the FTC acted on with BetterHelp. Marketing pages,
 * the funnels (/start*, /for/*, /try) and checkout keep their tracking.
 */
const PRIVATE_PREFIXES = [
  "/home",
  "/entries",
  "/insights",
  "/tasks",
  "/goals",
  "/habits",
  "/life-matrix",
  "/achievements",
  "/account",
  "/dashboard",
  "/onboarding",
  "/support",
  "/delete-account",
  "/actions",
  "/shared",
  "/voiced",
  "/admin",
  "/mic-test",
];

export function isPrivateAppSurface(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
