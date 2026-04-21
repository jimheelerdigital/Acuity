/**
 * Goal Progression Tree utilities — tree-math helpers shared between
 * the tree API (GET /api/goals/tree), the add-subgoal endpoint, and
 * the reparent endpoint.
 *
 * Kept in lib/ rather than inlined in the route handler so the
 * recursion + validation logic stays testable in isolation. No
 * Prisma reads from here — callers pass in flat goal lists or the
 * entire user goal set, we return shaped output.
 */

import type { Goal, Task, Prisma, PrismaClient } from "@prisma/client";

export const MAX_TREE_DEPTH = 4; // root = 0, so depth <= 4 == up to 5 levels

export type GoalNode = Goal & {
  children: GoalNode[];
  tasks: Task[];
  manualProgress: number;
  calculatedProgress: number;
};

/**
 * Build the forest from a flat list of goals + their tasks. Accepts
 * both parents and children in one array and returns the top-level
 * roots with `children` recursively populated.
 *
 * Ordering: roots sorted by createdAt desc (newest goals first).
 * Children sorted by createdAt asc (so the order they were added is
 * the order they read in the tree).
 */
export function buildGoalForest(
  goals: Goal[],
  tasksByGoalId: Map<string, Task[]>
): GoalNode[] {
  const nodeById = new Map<string, GoalNode>();
  for (const g of goals) {
    const tasks = tasksByGoalId.get(g.id) ?? [];
    nodeById.set(g.id, {
      ...g,
      children: [],
      tasks,
      manualProgress: g.progress,
      // Populated after the tree is connected — needs children.
      calculatedProgress: g.progress,
    });
  }

  const roots: GoalNode[] = [];
  for (const g of goals) {
    const node = nodeById.get(g.id);
    if (!node) continue;
    if (g.parentGoalId && nodeById.has(g.parentGoalId)) {
      nodeById.get(g.parentGoalId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children in createdAt asc so the tree reads in-order, roots
  // in createdAt desc so newest goals surface first.
  const sortChildren = (node: GoalNode) => {
    node.children.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
    for (const c of node.children) sortChildren(c);
  };
  for (const root of roots) sortChildren(root);
  roots.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Compute calculatedProgress bottom-up.
  for (const root of roots) computeRollupProgress(root);

  return roots;
}

/**
 * Bottom-up rollup:
 *   - Leaf (no children + no tasks): calculated = manual
 *   - Has tasks but no children: calculated = avg(task_complete ? 100 : 0, manual)
 *     where task_complete is DONE. Tasks weight equally with manual.
 *   - Has children: calculated = avg(all children's calculated + own task progress)
 *
 * Not stored — computed on every tree read. Manual progress stays
 * separate in `manualProgress` so the UI can show a small indicator
 * when the auto-rollup differs from the user's set value.
 */
export function computeRollupProgress(node: GoalNode): number {
  // Recurse first (post-order) so children have calculatedProgress set
  // before we compute the parent.
  for (const child of node.children) computeRollupProgress(child);

  const contributions: number[] = [];

  if (node.children.length > 0) {
    for (const c of node.children) contributions.push(c.calculatedProgress);
  }
  if (node.tasks.length > 0) {
    for (const t of node.tasks) {
      contributions.push(t.status === "DONE" ? 100 : 0);
    }
  }

  // Always include the user's manual value as a signal. Without it, a
  // leaf with no tasks would report 0 regardless of what the user set.
  contributions.push(node.manualProgress);

  const avg =
    contributions.reduce((s, v) => s + v, 0) / contributions.length;
  node.calculatedProgress = Math.round(avg);
  return node.calculatedProgress;
}

/**
 * Collect the set of descendant IDs of the given goal (inclusive).
 * Used for cycle prevention during reparent — a goal cannot be
 * reparented under itself or any of its own descendants.
 */
export function collectDescendantIds(
  goalId: string,
  goals: Goal[]
): Set<string> {
  const byParent = new Map<string | null, Goal[]>();
  for (const g of goals) {
    const key = g.parentGoalId ?? null;
    const bucket = byParent.get(key);
    if (bucket) bucket.push(g);
    else byParent.set(key, [g]);
  }

  const result = new Set<string>([goalId]);
  const stack: string[] = [goalId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const children = byParent.get(cur) ?? [];
    for (const c of children) {
      if (!result.has(c.id)) {
        result.add(c.id);
        stack.push(c.id);
      }
    }
  }
  return result;
}

/**
 * Compute the new treePath + depth when a goal is (re)parented under
 * `newParent`. Used on add-subgoal and on reparent.
 *
 * Pass null for newParent to place the goal at root.
 */
export function computePath(
  goalId: string,
  newParent: Pick<Goal, "id" | "treePath" | "depth"> | null
): { treePath: string; depth: number } {
  if (!newParent) {
    return { treePath: `/${goalId}/`, depth: 0 };
  }
  const parentPath = newParent.treePath ?? `/${newParent.id}/`;
  return {
    treePath: `${parentPath}${goalId}/`,
    depth: newParent.depth + 1,
  };
}

/**
 * Max depth of a subtree rooted at `goalId`. Uses the flat goal list
 * (no recursion cost beyond a map walk). Returns 0 for a leaf.
 */
export function subtreeMaxDepth(
  goalId: string,
  goals: Goal[]
): number {
  const byParent = new Map<string, Goal[]>();
  for (const g of goals) {
    if (!g.parentGoalId) continue;
    const bucket = byParent.get(g.parentGoalId);
    if (bucket) bucket.push(g);
    else byParent.set(g.parentGoalId, [g]);
  }

  const walk = (id: string, d: number): number => {
    const children = byParent.get(id) ?? [];
    if (children.length === 0) return d;
    let m = d;
    for (const c of children) {
      const cd = walk(c.id, d + 1);
      if (cd > m) m = cd;
    }
    return m;
  };
  return walk(goalId, 0);
}

/**
 * Fuzzy-match an extraction's parentGoalText against the user's
 * existing goal titles, then upsert a GoalSuggestion row for each
 * mentioned sub-goal. Orphan suggestions (no matching parent) are
 * dropped per spec.
 *
 * Match strategy: case-insensitive substring first (most robust for
 * short goal titles), then token-set-overlap ≥ 60% (catches
 * "get healthier" vs "health"). Not a real Levenshtein — the goal
 * titles are short and free-form enough that substring + token
 * overlap catches what users actually say.
 */
export async function persistSubGoalSuggestions(
  tx: PrismaClient | Prisma.TransactionClient,
  userId: string,
  sourceEntryId: string,
  suggestions: Array<{ parentGoalText: string; suggestedAction: string }>
): Promise<number> {
  if (!suggestions || suggestions.length === 0) return 0;

  const userGoals = await tx.goal.findMany({
    where: {
      userId,
      status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
    },
    select: { id: true, title: true },
  });
  if (userGoals.length === 0) return 0;

  let written = 0;
  for (const s of suggestions) {
    const matched = findBestGoalMatch(s.parentGoalText, userGoals);
    if (!matched) continue;

    // Dedupe against an existing PENDING suggestion with the same
    // (parent, text). Users who re-mention the same sub-goal across
    // multiple entries shouldn't see duplicate cards in the banner.
    const existing = await tx.goalSuggestion.findFirst({
      where: {
        userId,
        parentGoalId: matched.id,
        status: "PENDING",
        suggestedText: s.suggestedAction,
      },
      select: { id: true },
    });
    if (existing) continue;

    await tx.goalSuggestion.create({
      data: {
        userId,
        parentGoalId: matched.id,
        suggestedText: s.suggestedAction,
        sourceEntryId,
      },
    });
    written += 1;
  }
  return written;
}

function findBestGoalMatch(
  raw: string,
  goals: Array<{ id: string; title: string }>
): { id: string; title: string } | null {
  const norm = (s: string) => s.toLowerCase().trim();
  const target = norm(raw);
  if (!target) return null;

  // Substring — quickest, catches exact/near-exact references.
  for (const g of goals) {
    const t = norm(g.title);
    if (t.includes(target) || target.includes(t)) {
      return g;
    }
  }

  // Token overlap — ignore short/common words so "get healthier" and
  // "healthy lifestyle" match on the meaningful tokens.
  const stop = new Set([
    "a",
    "an",
    "the",
    "to",
    "of",
    "and",
    "or",
    "for",
    "get",
    "be",
    "is",
    "in",
    "on",
    "my",
  ]);
  const tokenize = (s: string) =>
    new Set(
      s
        .split(/[^a-z0-9]+/i)
        .map((t) => t.toLowerCase())
        .filter((t) => t.length >= 3 && !stop.has(t))
    );
  const t1 = tokenize(target);
  if (t1.size === 0) return null;

  let best: { id: string; title: string; overlap: number } | null = null;
  for (const g of goals) {
    const t2 = tokenize(g.title);
    if (t2.size === 0) continue;
    const inter = Array.from(t1).filter((x) => t2.has(x)).length;
    const union = new Set([...t1, ...t2]).size;
    const overlap = inter / union;
    if (overlap >= 0.6 && (!best || overlap > best.overlap)) {
      best = { id: g.id, title: g.title, overlap };
    }
  }
  return best ? { id: best.id, title: best.title } : null;
}
