/**
 * Follow-through report (Insights, 2026-10-27): what you said you'd do vs
 * what got done. Pure and deterministic; no AI. Served by
 * GET /api/insights/follow-through and drawn by the mobile
 * FollowThroughCard.
 *
 * Three parts:
 *  1. This week vs last week (rolling 7-day windows): tasks captured,
 *     how many came from recordings (Task.entryId), and tasks completed.
 *  2. Typical days to finish, by task group. Only groups with at least
 *     MIN_GROUP_COMPLETIONS completed tasks in the last 60 days, median
 *     time from capture to completion.
 *  3. Still open:
 *     - "repeated": an open task from a recording whose title closely
 *       matches tasks from at least one OTHER recording (normalized-token
 *       Jaccard >= REPEAT_SIMILARITY, at least 2 meaningful words). Exact
 *       repeats are rare in real data (9 groups across 2 users in 60 days,
 *       checked 2026-10-27), so the fuzzy match stays strict to avoid
 *       false claims.
 *     - otherwise "oldest": the longest-waiting open tasks from recordings
 *       (at least OLDEST_MIN_AGE_DAYS old). This makes no claim that they
 *       were mentioned again.
 *
 * The card renders nothing unless at least MIN_TASKS_TO_SHOW tasks were
 * captured in the last 14 days.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MIN_TASKS_TO_SHOW = 3;
export const MIN_GROUP_COMPLETIONS = 3;
export const MAX_GROUPS = 3;
export const REPEAT_SIMILARITY = 0.6;
export const REPEAT_WINDOW_DAYS = 60;
export const OLDEST_MIN_AGE_DAYS = 7;
export const MAX_OPEN_ITEMS = 3;

export type FollowThroughTask = {
  id: string;
  title: string | null;
  text: string | null;
  status: string;
  entryId: string | null;
  groupId: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

export type FollowThroughGroup = { id: string; name: string };

export type WeekStats = { captured: number; fromRecordings: number; completed: number };

export type FollowThroughReport = {
  thisWeek: WeekStats;
  lastWeek: WeekStats;
  groupSpeed: { group: string; medianDays: number; completed: number }[];
  stillOpen: {
    kind: "repeated" | "oldest" | "none";
    items: { id: string; title: string; mentions: number; ageDays: number }[];
  };
};

const STOPWORDS = new Set([
  "a", "an", "the", "to", "for", "of", "and", "or", "on", "in", "at", "my",
  "with", "about", "up", "out", "get", "do", "make", "go", "some", "me",
  "this", "that", "it", "is", "be", "need", "needs", "should", "will",
  "also", "too", "just", "really", "again", "new", "more", "some", "thing",
]);

export function titleOf(t: Pick<FollowThroughTask, "title" | "text">): string {
  return (t.title ?? t.text ?? "").trim();
}

/** Lower-case, strip punctuation, drop filler words. */
export function meaningfulTokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w))
  );
}

export function similarity(a: string, b: string): number {
  const ta = meaningfulTokens(a);
  const tb = meaningfulTokens(b);
  if (ta.size < 2 || tb.size < 2) {
    // Too short to fuzzy-match reliably: only an exact match counts.
    const na = [...ta].sort().join(" ");
    const nb = [...tb].sort().join(" ");
    return na.length > 0 && na === nb ? 1 : 0;
  }
  let inter = 0;
  let substantive = false; // at least one shared word of 4+ letters
  for (const w of ta) {
    if (tb.has(w)) {
      inter++;
      if (w.length >= 4) substantive = true;
    }
  }
  if (!substantive) return 0;
  return inter / (ta.size + tb.size - inter);
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function weekStats(tasks: FollowThroughTask[], from: number, to: number): WeekStats {
  const inWin = (d: Date | null) => !!d && d.getTime() >= from && d.getTime() < to;
  const captured = tasks.filter((t) => inWin(t.createdAt));
  return {
    captured: captured.length,
    fromRecordings: captured.filter((t) => !!t.entryId).length,
    completed: tasks.filter((t) => t.status === "DONE" && inWin(t.completedAt)).length,
  };
}

export function computeFollowThrough(
  tasks: FollowThroughTask[],
  groups: FollowThroughGroup[],
  now: Date = new Date()
): FollowThroughReport | null {
  const t0 = now.getTime();
  const recentCaptured = tasks.filter((t) => t.createdAt.getTime() >= t0 - 14 * DAY_MS);
  if (recentCaptured.length < MIN_TASKS_TO_SHOW) return null;

  const thisWeek = weekStats(tasks, t0 - 7 * DAY_MS, t0 + 1);
  const lastWeek = weekStats(tasks, t0 - 14 * DAY_MS, t0 - 7 * DAY_MS);

  // ── Typical days to finish, by group ──
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const durations = new Map<string, number[]>();
  for (const t of tasks) {
    if (t.status !== "DONE" || !t.completedAt || !t.groupId) continue;
    if (t.completedAt.getTime() < t0 - 60 * DAY_MS) continue;
    const days = Math.max(0, (t.completedAt.getTime() - t.createdAt.getTime()) / DAY_MS);
    const arr = durations.get(t.groupId) ?? [];
    arr.push(days);
    durations.set(t.groupId, arr);
  }
  const groupSpeed = [...durations.entries()]
    .filter(([id, d]) => d.length >= MIN_GROUP_COMPLETIONS && groupName.has(id))
    .map(([id, d]) => ({
      group: groupName.get(id)!,
      medianDays: Math.round(median(d) * 10) / 10,
      completed: d.length,
    }))
    .sort((a, b) => b.completed - a.completed)
    .slice(0, MAX_GROUPS);

  // ── Still open ──
  const fromRecordings = tasks.filter(
    (t) => !!t.entryId && t.createdAt.getTime() >= t0 - REPEAT_WINDOW_DAYS * DAY_MS
  );
  const open = fromRecordings.filter((t) => t.status !== "DONE");
  const ageDays = (t: FollowThroughTask) => Math.floor((t0 - t.createdAt.getTime()) / DAY_MS);

  const repeated: { task: FollowThroughTask; mentions: number }[] = [];
  const claimed = new Set<string>();
  // Newest open task first, so the representative is the latest phrasing.
  for (const t of [...open].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    if (claimed.has(t.id)) continue;
    const title = titleOf(t);
    if (!title) continue;
    const matches = fromRecordings.filter(
      (o) => o.id !== t.id && similarity(title, titleOf(o)) >= REPEAT_SIMILARITY
    );
    // If any matching task was already completed AFTER this one was
    // captured, it's been dealt with; don't call it still open.
    if (matches.some((m) => m.status === "DONE" && m.completedAt && m.completedAt >= t.createdAt)) {
      continue;
    }
    const entries = new Set([t.entryId, ...matches.map((m) => m.entryId)]);
    if (entries.size < 2) continue;
    claimed.add(t.id);
    for (const m of matches) claimed.add(m.id);
    repeated.push({ task: t, mentions: entries.size });
  }

  let stillOpen: FollowThroughReport["stillOpen"];
  if (repeated.length > 0) {
    stillOpen = {
      kind: "repeated",
      items: repeated
        .sort((a, b) => b.mentions - a.mentions)
        .slice(0, MAX_OPEN_ITEMS)
        .map(({ task, mentions }) => ({
          id: task.id,
          title: titleOf(task),
          mentions,
          ageDays: ageDays(task),
        })),
    };
  } else {
    const oldest = open
      .filter((t) => ageDays(t) >= OLDEST_MIN_AGE_DAYS && titleOf(t))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, MAX_OPEN_ITEMS);
    stillOpen =
      oldest.length > 0
        ? {
            kind: "oldest",
            items: oldest.map((t) => ({ id: t.id, title: titleOf(t), mentions: 1, ageDays: ageDays(t) })),
          }
        : { kind: "none", items: [] };
  }

  return { thisWeek, lastWeek, groupSpeed, stillOpen };
}
