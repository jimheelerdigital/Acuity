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

import type { Goal, Task } from "@prisma/client";

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
