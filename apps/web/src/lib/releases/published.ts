/**
 * Which release-note pages (/whats-new) are public (2026-10-27).
 *
 * The pages read the same entries as the release email
 * (src/emails/announcements/releases.ts), so the app's What's New, the email
 * and the web page say the same thing. An iOS release only appears once the
 * App Store's public lookup serves that version (or a later one), the same
 * gate the email send script uses, so a page can't announce an update people
 * can't get yet. Android has no public lookup, so Android entries always
 * show. Preview deployments show everything so a page can be reviewed first.
 */
import type { ReleaseEmail } from "@/emails/announcements/release";
import { RELEASE_EMAILS } from "@/emails/announcements/releases";

export const APP_STORE_LOOKUP = "https://itunes.apple.com/lookup?id=6762633410&country=us";

/** -1 / 0 / 1, numeric per part ("1.10" > "1.9"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function isPublished(
  r: Pick<ReleaseEmail, "version" | "platform">,
  liveIosVersion: string | null,
  showAll = false
): boolean {
  if (showAll) return true;
  if (r.platform !== "ios") return true;
  if (!liveIosVersion) return false;
  return compareVersions(r.version, liveIosVersion) <= 0;
}

/** The version the App Store serves right now; null if the lookup fails. Cached 10 min. */
export async function liveIosVersion(): Promise<string | null> {
  try {
    const res = await fetch(APP_STORE_LOOKUP, { next: { revalidate: 600 } });
    if (!res.ok) return null;
    const j = (await res.json()) as { results?: { version?: string }[] };
    return j.results?.[0]?.version ?? null;
  } catch {
    return null;
  }
}

/** Preview deployments show unreleased versions so the page can be reviewed before launch. */
export function showAllReleases(): boolean {
  return process.env.VERCEL_ENV === "preview";
}

export async function publishedReleases(): Promise<ReleaseEmail[]> {
  const live = await liveIosVersion();
  const all = showAllReleases();
  return RELEASE_EMAILS.filter((r) => isPublished(r, live, all));
}

/** iOS and Android can share a version number; Android pages get a suffix. */
export function releaseSlug(r: Pick<ReleaseEmail, "version" | "platform">): string {
  return r.platform === "ios" ? r.version : `${r.version}-android`;
}
