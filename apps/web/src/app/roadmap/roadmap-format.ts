import { ROADMAP_CATEGORY_META, type RoadmapCategory, type RoadmapStatus } from "@acuity/shared";

/**
 * Pure formatting helpers for the roadmap pages. Kept OUT of the "use client"
 * roadmap-ui module on purpose: a server component that imports a function
 * from a client module gets a client reference, not a callable function
 * ("h is not a function" on the first preview of /roadmap/[id], 2026-10-19).
 */

export function categoryLabel(category: RoadmapCategory | null): string | null {
  return category ? ROADMAP_CATEGORY_META[category].label : null;
}

/** "Shipped in 1.9.4 · Oct 18, 2026" / "Next app update" — the line under a title. */
export function contextLine(item: {
  status: RoadmapStatus;
  shippedVersion: string | null;
  shippedAt: string | null;
  timeframe: string | null;
}): string | null {
  if (item.status === "shipped") {
    const parts: string[] = [];
    if (item.shippedVersion) parts.push(`Shipped in ${item.shippedVersion}`);
    if (item.shippedAt) {
      parts.push(
        new Date(item.shippedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        })
      );
    }
    return parts.length ? parts.join(" · ") : "Shipped";
  }
  return item.timeframe;
}
