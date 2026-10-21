/**
 * Live App Store rating for structured data (Apple's public lookup API,
 * cached an hour). The homepage JSON-LD hardcoded "5.0 from 4" since June;
 * by 2026-10-21 the real figure was 4.78 from 9, and a stale
 * aggregateRating risks a structured-data manual action.
 *
 * Visible copy still follows the 2026-09-24 rule (five stars "on the App
 * Store", no number); this is for search engines only.
 */
export const APP_STORE_ID = "6762633410";

export type AppStoreRating = { value: number; count: number };

export async function getAppStoreRating(): Promise<AppStoreRating | null> {
  try {
    const res = await fetch(`https://itunes.apple.com/lookup?id=${APP_STORE_ID}&country=us`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: { averageUserRating?: number; userRatingCount?: number }[] };
    const r = json.results?.[0];
    if (!r?.averageUserRating || !r.userRatingCount) return null;
    return { value: Math.round(r.averageUserRating * 10) / 10, count: r.userRatingCount };
  } catch {
    return null;
  }
}
