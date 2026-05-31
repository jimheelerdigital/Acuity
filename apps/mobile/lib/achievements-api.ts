/**
 * Mobile-side API helpers for the v1.3 achievements feature.
 * Thin wrappers over the existing `api` client so call sites stay
 * compact and the response types stay co-located with the consumers.
 */

import { api } from "@/lib/api";

export type AchievementCategory = "CONSISTENCY" | "REFLECTION" | "MOMENT";

export type AchievementSummary = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: AchievementCategory;
  tier: number;
  emblem: string;
  points: number;
  iconKey: string;
};

export type CatalogItem = AchievementSummary & {
  earned: boolean;
  earnedAt: string | null;
  pointsAwarded: number | null;
};

export type CatalogResponse = {
  items: CatalogItem[];
  totals: { earned: number; total: number; points: number };
};

export type PendingItem = {
  id: string; // UserAchievement.id — used for /seen POST
  achievementId: string;
  earnedAt: string;
  pointsAwarded: number;
  achievement: AchievementSummary;
};

export type PendingResponse = { items: PendingItem[] };

export function fetchCatalog(): Promise<CatalogResponse> {
  return api.get<CatalogResponse>("/api/achievements");
}

export function fetchPending(): Promise<PendingResponse> {
  return api.get<PendingResponse>("/api/achievements/pending");
}

export function markAchievementSeen(
  userAchievementId: string
): Promise<{ ok: true }> {
  return api.post<{ ok: true }>(
    `/api/achievements/${userAchievementId}/seen`,
    {}
  );
}
