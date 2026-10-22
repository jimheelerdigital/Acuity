/**
 * Task-group helpers for the Manage groups screen (app/task-groups.tsx).
 * Pure (no React Native imports) so the web vitest suite can test it.
 */

export type ManagedGroup = {
  id: string;
  name: string;
  icon: string;
  color: string;
  order: number;
  isDefault?: boolean;
  isAIGenerated?: boolean;
  taskCount?: number;
};

/** Matches the server's 40-char cap (api/task-groups POST/PATCH). */
export const GROUP_NAME_MAX = 40;

/**
 * Ionicons offered for a group. The first five are the seeded defaults'
 * icons (apps/web/src/lib/task-groups.ts DEFAULT_TASK_GROUPS).
 */
export const GROUP_ICONS = [
  "briefcase",
  "person",
  "heart",
  "cart",
  "ellipsis-horizontal",
  "home",
  "people",
  "school",
  "barbell",
  "cash",
  "airplane",
  "book",
  "leaf",
  "paw",
  "car",
  "star",
] as const;

/** Palette for new groups (the API requires a color; mobile doesn't show it). */
export const GROUP_COLORS = [
  "#3B82F6",
  "#7C3AED",
  "#EF4444",
  "#F59E0B",
  "#10B981",
  "#EC4899",
  "#06B6D4",
  "#6B7280",
] as const;

/** First palette color not already used, else cycle by count. */
export function nextGroupColor(groups: Pick<ManagedGroup, "color">[]): string {
  const used = new Set(groups.map((g) => g.color.toUpperCase()));
  return GROUP_COLORS.find((c) => !used.has(c)) ?? GROUP_COLORS[groups.length % GROUP_COLORS.length];
}

/**
 * Moves the group at `index` up (-1) or down (+1) and renumbers every
 * group 0..n-1, so stored orders become contiguous even if they weren't
 * (seeded groups and appended ones can share or skip numbers). Returns
 * null when the move would leave the list.
 */
export function moveGroup<T extends Pick<ManagedGroup, "order">>(
  groups: T[],
  index: number,
  delta: -1 | 1
): T[] | null {
  const target = index + delta;
  if (index < 0 || index >= groups.length || target < 0 || target >= groups.length) return null;
  const list = [...groups];
  const [item] = list.splice(index, 1);
  list.splice(target, 0, item);
  return list.map((g, i) => ({ ...g, order: i }));
}
