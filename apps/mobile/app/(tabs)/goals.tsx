import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  formatRelativeDate,
  GOAL_GROUPS,
  goalGroupForArea,
  type GoalGroupMeta,
  type UserProgression,
} from "@acuity/shared";
import {
  Briefcase,
  ChevronDown,
  HeartPulse,
  Palette,
  Sprout,
  Users,
  Wallet,
} from "lucide-react-native";

import { LockedFeatureCard } from "@/components/locked-feature-card";
import { api } from "@/lib/api";
import { getCached, isStale, setCached } from "@/lib/cache";
import { fetchUserProgression } from "@/lib/userProgression";

const GOALS_TREE_KEY = "/api/goals/tree";
const GOALS_TREE_ARCHIVED_KEY = "/api/goals/tree?includeArchived=1";
const GOALS_PROGRESSION_KEY = "/api/user/progression";

function treeCacheKey(withArchived: boolean): string {
  return withArchived ? GOALS_TREE_ARCHIVED_KEY : GOALS_TREE_KEY;
}

type GoalsTreeResponse = {
  roots: TreeGoal[];
  pendingSuggestionsCount: number;
};

/**
 * Walk the tree and return a new tree with `patcher` applied to the
 * goal whose id matches. All parent nodes on the path get new array
 * references so `React.memo` children with stable deps re-render only
 * if they're on the path. Nodes off the path share the prior reference
 * so their `TreeNode` memo no-ops.
 */
function patchGoalInTree(
  roots: TreeGoal[],
  id: string,
  patcher: (g: TreeGoal) => TreeGoal
): TreeGoal[] {
  let changed = false;
  const next = roots.map((r) => {
    const replaced = patchGoalRecursive(r, id, patcher);
    if (replaced !== r) changed = true;
    return replaced;
  });
  return changed ? next : roots;
}

function patchGoalRecursive(
  node: TreeGoal,
  id: string,
  patcher: (g: TreeGoal) => TreeGoal
): TreeGoal {
  if (node.id === id) return patcher(node);
  let childChanged = false;
  const newChildren = node.children.map((c) => {
    const replaced = patchGoalRecursive(c, id, patcher);
    if (replaced !== c) childChanged = true;
    return replaced;
  });
  if (!childChanged) return node;
  return { ...node, children: newChildren };
}

function removeGoalFromTree(roots: TreeGoal[], id: string): TreeGoal[] {
  let changed = false;
  const next: TreeGoal[] = [];
  for (const r of roots) {
    if (r.id === id) {
      changed = true;
      continue;
    }
    const cleaned = removeGoalRecursive(r, id);
    if (cleaned !== r) changed = true;
    next.push(cleaned);
  }
  return changed ? next : roots;
}

function removeGoalRecursive(node: TreeGoal, id: string): TreeGoal {
  let childChanged = false;
  const newChildren: TreeGoal[] = [];
  for (const c of node.children) {
    if (c.id === id) {
      childChanged = true;
      continue;
    }
    const cleaned = removeGoalRecursive(c, id);
    if (cleaned !== c) childChanged = true;
    newChildren.push(cleaned);
  }
  if (!childChanged) return node;
  return { ...node, children: newChildren };
}

function patchTaskStatusInTree(
  roots: TreeGoal[],
  taskId: string,
  nextStatus: string
): TreeGoal[] {
  let rootsChanged = false;
  const next = roots.map((r) => {
    const replaced = patchTaskInGoal(r, taskId, nextStatus);
    if (replaced !== r) rootsChanged = true;
    return replaced;
  });
  return rootsChanged ? next : roots;
}

function patchTaskInGoal(
  node: TreeGoal,
  taskId: string,
  nextStatus: string
): TreeGoal {
  let taskChanged = false;
  const newTasks = node.tasks.map((t) => {
    if (t.id !== taskId) return t;
    taskChanged = true;
    return { ...t, status: nextStatus };
  });
  let childChanged = false;
  const newChildren = node.children.map((c) => {
    const replaced = patchTaskInGoal(c, taskId, nextStatus);
    if (replaced !== c) childChanged = true;
    return replaced;
  });
  if (!taskChanged && !childChanged) return node;
  return {
    ...node,
    tasks: taskChanged ? newTasks : node.tasks,
    children: childChanged ? newChildren : node.children,
  };
}

function tapHaptic(): void {
  if (Platform.OS !== "ios") return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/**
 * Overlay in-flight local mutations on top of the server's freshly-
 * returned tree. For each pending goal id we preserve the local
 * goal's `status`; for each pending task id we preserve the local
 * task's `status`. Everything else comes straight from the server.
 * Called on silent focus-driven revalidation so a still-pending
 * optimistic check doesn't flicker back to its pre-tap state.
 */
function mergePendingIntoServerTree(
  serverRoots: TreeGoal[],
  localRoots: TreeGoal[],
  pendingGoalIds: Set<string>,
  pendingTaskIds: Set<string>
): TreeGoal[] {
  const localByGoalId = new Map<string, TreeGoal>();
  const localByTaskId = new Map<string, TreeTask>();
  const indexLocal = (node: TreeGoal) => {
    localByGoalId.set(node.id, node);
    for (const t of node.tasks) localByTaskId.set(t.id, t);
    for (const c of node.children) indexLocal(c);
  };
  for (const r of localRoots) indexLocal(r);

  const overlay = (node: TreeGoal): TreeGoal => {
    const localGoal = localByGoalId.get(node.id);
    const overlaidStatus =
      localGoal && pendingGoalIds.has(node.id)
        ? localGoal.status
        : node.status;

    const tasks = node.tasks.map((t) => {
      if (!pendingTaskIds.has(t.id)) return t;
      const localTask = localByTaskId.get(t.id);
      if (!localTask) return t;
      return { ...t, status: localTask.status };
    });
    const children = node.children.map(overlay);
    return { ...node, status: overlaidStatus, tasks, children };
  };

  return serverRoots.map(overlay);
}

/**
 * Mobile Goals — expandable tree. Parity with web's /goals page:
 *   - top-level goals render as cards, chevron flips on expand
 *   - children indent 16px per level (tighter than web's 24 because
 *     mobile screen width is the constraint)
 *   - task leaves with tap-to-toggle
 *   - suggestion banner when PENDING exists → bottom-sheet modal
 *   - Add sub-goal via +, archive/delete via kebab sheet
 *
 * No drag-to-reparent on mobile (too fiddly without a gesture-handler
 * build). Deferred to v2.
 */

type TreeGoal = {
  id: string;
  title: string;
  description: string | null;
  lifeArea: string;
  status: string;
  manualProgress: number;
  calculatedProgress: number;
  parentGoalId: string | null;
  depth: number;
  createdAt: string;
  lastMentionedAt: string | null;
  children: TreeGoal[];
  tasks: TreeTask[];
};

type TreeTask = {
  id: string;
  title: string | null;
  text: string | null;
  status: string;
  priority: string;
};

const LIFE_AREAS: Record<string, { label: string; color: string }> = {
  CAREER: { label: "Career", color: "#3B82F6" },
  HEALTH: { label: "Health", color: "#14B8A6" },
  RELATIONSHIPS: { label: "Relationships", color: "#F43F5E" },
  FINANCES: { label: "Finances", color: "#F59E0B" },
  PERSONAL: { label: "Personal Growth", color: "#A855F7" },
  OTHER: { label: "Other", color: "#71717A" },
};

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  NOT_STARTED: { label: "Not started", color: "#71717A" },
  IN_PROGRESS: { label: "In progress", color: "#34D399" },
  ON_HOLD: { label: "On hold", color: "#FBBF24" },
  COMPLETE: { label: "Complete", color: "#A78BFA" },
  ARCHIVED: { label: "Archived", color: "#52525B" },
};

const ACTION_TO_STATUS: Record<string, string> = {
  complete: "COMPLETE",
  archive: "ARCHIVED",
  start: "IN_PROGRESS",
  restore: "NOT_STARTED",
};

export default function GoalsTab() {
  const router = useRouter();
  const [includeArchived, setIncludeArchived] = useState(false);

  const initialCacheKey = treeCacheKey(includeArchived);
  const initialCached = getCached<GoalsTreeResponse>(initialCacheKey);

  const [roots, setRoots] = useState<TreeGoal[]>(
    () => initialCached?.roots ?? []
  );
  const [pendingSuggestions, setPendingSuggestions] = useState(
    () => initialCached?.pendingSuggestionsCount ?? 0
  );
  const [loading, setLoading] = useState(() => !initialCached);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addSubgoalFor, setAddSubgoalFor] = useState<TreeGoal | null>(null);
  const [actionSheetFor, setActionSheetFor] = useState<TreeGoal | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [progression, setProgression] = useState<UserProgression | null>(
    () => getCached<UserProgression>(GOALS_PROGRESSION_KEY) ?? null
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set()
  );

  // Pending mutations keep optimistic state alive during a focus-
  // driven silent revalidation. Ids are goal ids or task ids; we merge
  // server response by patching each pending id back to local state.
  const pendingGoalMutationsRef = useRef<Set<string>>(new Set());
  const pendingTaskMutationsRef = useRef<Set<string>>(new Set());

  const fetchTree = useCallback(
    async (withArchived: boolean, silent: boolean) => {
      if (!silent) setLoading(true);
      try {
        const key = treeCacheKey(withArchived);
        const [res, prog] = await Promise.all([
          api.get<GoalsTreeResponse>(key),
          fetchUserProgression().catch(() => null),
        ]);
        setCached(key, res);
        if (prog) setCached(GOALS_PROGRESSION_KEY, prog);

        // Merge server state with anything still locally-pending. We
        // can't know from the server response which tasks/goals the
        // user mutated mid-fetch, so we overlay the prior local copy
        // for any id we have a pending mutation on.
        setRoots((prev) => {
          const serverRoots = res.roots ?? [];
          if (
            pendingGoalMutationsRef.current.size === 0 &&
            pendingTaskMutationsRef.current.size === 0
          ) {
            return serverRoots;
          }
          return mergePendingIntoServerTree(
            serverRoots,
            prev,
            pendingGoalMutationsRef.current,
            pendingTaskMutationsRef.current
          );
        });
        setPendingSuggestions(res.pendingSuggestionsCount ?? 0);
        setProgression(prog);
        setExpanded((prevExpanded) => {
          if (prevExpanded.size > 0) return prevExpanded;
          const next = new Set<string>();
          for (const r of res.roots) next.add(r.id);
          return next;
        });
      } catch {
        // silent
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  // Initial fetch — silent if cache hydrated.
  useEffect(() => {
    fetchTree(includeArchived, roots.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when the user toggles "include archived" — different
  // cache key, so seed from cache if we have it, otherwise show the
  // loading state until the fresh list lands.
  useEffect(() => {
    const key = treeCacheKey(includeArchived);
    const cached = getCached<GoalsTreeResponse>(key);
    if (cached) {
      setRoots(cached.roots ?? []);
      setPendingSuggestions(cached.pendingSuggestionsCount ?? 0);
      setLoading(false);
    } else {
      setLoading(true);
    }
    fetchTree(includeArchived, !!cached);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeArchived]);

  // Silent revalidation on focus — cached tree stays painted.
  useFocusEffect(
    useCallback(() => {
      const key = treeCacheKey(includeArchived);
      if (isStale(key) || isStale(GOALS_PROGRESSION_KEY)) {
        fetchTree(includeArchived, true);
      }
    }, [fetchTree, includeArchived])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchTree(includeArchived, true);
  }, [fetchTree, includeArchived]);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const performAction = useCallback(
    (goalId: string, action: "complete" | "archive" | "start" | "restore") => {
      if (action === "complete") tapHaptic();
      const nextStatus = ACTION_TO_STATUS[action];
      if (nextStatus) {
        setRoots((prev) =>
          patchGoalInTree(prev, goalId, (g) => ({ ...g, status: nextStatus }))
        );
      }
      pendingGoalMutationsRef.current.add(goalId);
      api
        .patch("/api/goals", { id: goalId, action })
        .catch(() => {
          Alert.alert("Couldn't update", "Please try again.");
        })
        .finally(() => {
          pendingGoalMutationsRef.current.delete(goalId);
        });
    },
    []
  );

  const deleteGoal = useCallback((goalId: string) => {
    Alert.alert("Delete goal?", "This deletes the goal + its sub-goals.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          // Optimistic removal — the goal vanishes from the tree
          // immediately. If the DELETE fails, the focus-driven
          // revalidation will restore it (and the Alert below fires).
          setRoots((prev) => removeGoalFromTree(prev, goalId));
          pendingGoalMutationsRef.current.add(goalId);
          api
            .del(`/api/goals/${goalId}`)
            .catch(() => {
              Alert.alert("Couldn't delete", "Please try again.");
            })
            .finally(() => {
              pendingGoalMutationsRef.current.delete(goalId);
            });
        },
      },
    ]);
  }, []);

  const openGoal = useCallback(
    (id: string) => router.push(`/goal/${id}`),
    [router]
  );

  const toggleTask = useCallback((taskId: string, currentStatus: string) => {
    const isComplete = currentStatus !== "DONE";
    if (isComplete) tapHaptic();
    const nextStatus = isComplete ? "DONE" : "OPEN";
    setRoots((prev) => patchTaskStatusInTree(prev, taskId, nextStatus));
    pendingTaskMutationsRef.current.add(taskId);
    api
      .patch("/api/tasks", {
        id: taskId,
        action: isComplete ? "complete" : "reopen",
      })
      .catch(() => {
        // Server will be out of sync with local; focus refetch corrects.
      })
      .finally(() => {
        pendingTaskMutationsRef.current.delete(taskId);
      });
  }, []);

  const inProgressCount = useMemo(() => {
    let n = 0;
    const walk = (g: TreeGoal) => {
      if (g.status === "IN_PROGRESS") n += 1;
      for (const c of g.children) walk(c);
    };
    for (const r of roots) walk(r);
    return n;
  }, [roots]);

  const groupedRoots = useMemo(() => {
    const byGroup = new Map<string, TreeGoal[]>();
    for (const g of roots) {
      const grp = goalGroupForArea(g.lifeArea);
      const arr = byGroup.get(grp.id) ?? [];
      arr.push(g);
      byGroup.set(grp.id, arr);
    }
    return GOAL_GROUPS.map((group) => ({
      group,
      goals: byGroup.get(group.id) ?? [],
    }));
  }, [roots]);

  const toggleGroupCollapse = useCallback((id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (loading && roots.length === 0) {
    return (
      <SafeAreaView
        edges={["top"]}
        className="flex-1 items-center justify-center bg-white dark:bg-[#0B0B12]"
      >
        <ActivityIndicator color="#7C3AED" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-white dark:bg-[#0B0B12]">
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#7C3AED"
          />
        }
      >
        <View className="flex-row items-baseline gap-2 mb-1">
          <Text className="text-4xl font-bold text-zinc-900 dark:text-zinc-50">
            Goals
          </Text>
          {inProgressCount > 0 && (
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              {inProgressCount} in progress
            </Text>
          )}
        </View>
        <Text className="text-sm text-zinc-400 dark:text-zinc-500 mb-4">
          What you&apos;re working toward. Tap to open, + to add a sub-step.
        </Text>

        {progression && !progression.unlocked.goalSuggestions && (
          <View className="mb-5">
            <LockedFeatureCard
              unlockKey="goalSuggestions"
              progression={progression}
            />
          </View>
        )}

        {progression?.unlocked.goalSuggestions && pendingSuggestions > 0 && (
          <Pressable
            onPress={() => setSuggestionsOpen(true)}
            className="mb-5 rounded-2xl border border-violet-900/30 bg-violet-950/10 p-4"
          >
            <Text className="text-[11px] font-semibold uppercase tracking-widest text-violet-400">
              From your recordings
            </Text>
            <Text className="mt-1 text-sm text-zinc-900 dark:text-zinc-50">
              {pendingSuggestions} reflection
              {pendingSuggestions === 1 ? "" : "s"} could become sub-goal
              {pendingSuggestions === 1 ? "" : "s"}. Review →
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => setIncludeArchived((v) => !v)}
          className="mb-4 flex-row items-center gap-2 self-start"
        >
          <View
            className={`h-4 w-4 rounded border-2 ${
              includeArchived
                ? "bg-violet-600 border-violet-600"
                : "border-zinc-300 dark:border-white/20"
            } items-center justify-center`}
          >
            {includeArchived && (
              <Ionicons name="checkmark" size={10} color="#FFFFFF" />
            )}
          </View>
          <Text className="text-xs text-zinc-500 dark:text-zinc-400">
            Show archived (on hold)
          </Text>
        </Pressable>

        {roots.length === 0 ? (
          <View className="rounded-2xl border border-dashed border-zinc-300 dark:border-white/10 px-6 py-16 items-center">
            <Ionicons name="flag-outline" size={36} color="#71717A" />
            <Text className="mt-3 text-sm font-medium text-zinc-600 dark:text-zinc-300">
              No goals yet
            </Text>
            <Text className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 text-center max-w-xs">
              Mention a goal in your daily debrief and we&apos;ll track it.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            {groupedRoots.map(({ group, goals }) => {
              if (goals.length === 0) return null;
              const collapsed = collapsedGroups.has(group.id);
              return (
                <View key={group.id}>
                  {/* Stronger group header (2026-04-28): hairline
                      top + colored bottom underline so each section
                      reads as its own block. Eyebrow bumped 11px →
                      13px / tracking 1.6 to match the dashboard's
                      shared eyebrow rhythm. */}
                  <Pressable
                    onPress={() => toggleGroupCollapse(group.id)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      paddingVertical: 10,
                      marginBottom: 12,
                      borderTopWidth: 0.5,
                      borderTopColor: "rgba(161,161,170,0.18)",
                      borderBottomWidth: 1,
                      borderBottomColor: `${group.color}33`,
                    }}
                  >
                    <View
                      style={{
                        height: 32,
                        width: 32,
                        borderRadius: 16,
                        backgroundColor: group.color + "22",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <GoalGroupIcon name={group.icon} color={group.color} />
                    </View>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        letterSpacing: 1.6,
                        textTransform: "uppercase",
                        color: "#E4E4E7",
                      }}
                    >
                      {group.label}
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "500",
                        color: "rgba(168,168,180,0.6)",
                      }}
                    >
                      {goals.length}
                    </Text>
                    <View style={{ flex: 1 }} />
                    <ChevronDown
                      size={16}
                      color="#A1A1AA"
                      style={{
                        transform: [{ rotate: collapsed ? "-90deg" : "0deg" }],
                      }}
                    />
                  </Pressable>
                  {!collapsed && (
                    <View style={{ gap: 8 }}>
                      {goals.map((g) => (
                        <TreeNode
                          key={g.id}
                          goal={g}
                          depth={0}
                          expanded={expanded}
                          onToggleExpand={toggleExpanded}
                          onOpen={openGoal}
                          onAddSubgoal={setAddSubgoalFor}
                          onActions={setActionSheetFor}
                          onToggleTask={toggleTask}
                        />
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {addSubgoalFor && (
        <AddSubgoalSheet
          parent={addSubgoalFor}
          onClose={() => setAddSubgoalFor(null)}
          onSaved={() => {
            setAddSubgoalFor(null);
            // A new sub-goal isn't derivable client-side (server
            // assigns id, depth, parent linkage), so force-refetch.
            fetchTree(includeArchived, true);
          }}
        />
      )}

      {actionSheetFor && (
        <ActionSheet
          goal={actionSheetFor}
          onClose={() => setActionSheetFor(null)}
          onAction={(action) => {
            const g = actionSheetFor;
            setActionSheetFor(null);
            if (action === "delete") {
              deleteGoal(g.id);
            } else {
              performAction(g.id, action);
            }
          }}
        />
      )}

      {suggestionsOpen && (
        <SuggestionsSheet
          onClose={() => setSuggestionsOpen(false)}
          onChanged={() => {
            // Accepting a suggestion materializes a new goal on the
            // server — force-refetch to pick it up.
            fetchTree(includeArchived, true);
          }}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Tree node recursive ─────────────────────────────────────────────────

const TreeNode = memo(function TreeNode({
  goal,
  depth,
  expanded,
  onToggleExpand,
  onOpen,
  onAddSubgoal,
  onActions,
  onToggleTask,
}: {
  goal: TreeGoal;
  depth: number;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onOpen: (id: string) => void;
  onAddSubgoal: (goal: TreeGoal) => void;
  onActions: (goal: TreeGoal) => void;
  onToggleTask: (id: string, status: string) => void;
}) {
  const status = STATUS_STYLES[goal.status] ?? STATUS_STYLES.NOT_STARTED;
  const area = LIFE_AREAS[goal.lifeArea] ?? {
    label: goal.lifeArea,
    color: "#71717A",
  };
  const isExpanded = expanded.has(goal.id);
  const hasChildren = goal.children.length > 0;
  const hasTasks = goal.tasks.length > 0;
  const hasAny = hasChildren || hasTasks;
  const canAddSub = goal.depth < 4;
  const manualDifferent =
    goal.manualProgress !== goal.calculatedProgress && goal.manualProgress !== 0;
  const struck = goal.status === "COMPLETE";

  return (
    <View style={{ marginLeft: depth * 16 }}>
      <View className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-3">
        <View className="flex-row items-start gap-2">
          {hasAny ? (
            <Pressable
              onPress={() => onToggleExpand(goal.id)}
              hitSlop={8}
              className="mt-1"
            >
              <Ionicons
                name={isExpanded ? "chevron-down" : "chevron-forward"}
                size={14}
                color="#A1A1AA"
              />
            </Pressable>
          ) : (
            <View style={{ width: 14 }} />
          )}

          <Pressable
            onPress={() => onOpen(goal.id)}
            className="flex-1"
          >
            <View className="flex-row items-center flex-wrap gap-1.5 mb-1">
              <View
                className="rounded-full px-2 py-0.5"
                style={{ backgroundColor: status.color + "25" }}
              >
                <Text
                  style={{
                    color: status.color,
                    fontSize: 10,
                    fontWeight: "600",
                  }}
                >
                  {status.label}
                </Text>
              </View>
              <View
                className="rounded-full px-2 py-0.5"
                style={{ backgroundColor: area.color + "20" }}
              >
                <Text style={{ color: area.color, fontSize: 10, fontWeight: "600" }}>
                  {area.label}
                </Text>
              </View>
              {hasChildren && (
                <Text className="text-[10px] text-zinc-400 dark:text-zinc-500">
                  {goal.children.length} sub-goal
                  {goal.children.length === 1 ? "" : "s"}
                </Text>
              )}
            </View>
            <Text
              className={`text-base font-semibold leading-snug ${
                struck
                  ? "text-zinc-400 dark:text-zinc-500 line-through"
                  : "text-zinc-900 dark:text-zinc-50"
              }`}
            >
              {goal.title}
            </Text>

            <View className="mt-2 flex-row items-center gap-2">
              <View className="h-1.5 flex-1 rounded-full bg-zinc-100 dark:bg-white/10">
                <View
                  className="h-full rounded-full bg-violet-500"
                  style={{ width: `${goal.calculatedProgress}%` }}
                />
              </View>
              <Text className="text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500 w-8 text-right">
                {goal.calculatedProgress}%
              </Text>
              {manualDifferent && (
                <Text className="text-[9px] text-zinc-400 dark:text-zinc-500">
                  you: {goal.manualProgress}%
                </Text>
              )}
            </View>
          </Pressable>

          <View className="flex-row items-center gap-0.5">
            {canAddSub && (
              <Pressable
                onPress={() => onAddSubgoal(goal)}
                hitSlop={8}
                className="p-1.5"
              >
                <Ionicons name="add" size={18} color="#A78BFA" />
              </Pressable>
            )}
            <Pressable
              onPress={() => onActions(goal)}
              hitSlop={8}
              className="p-1.5"
            >
              <Ionicons name="ellipsis-horizontal" size={16} color="#71717A" />
            </Pressable>
          </View>
        </View>
      </View>

      {isExpanded && hasAny && (
        <View className="mt-1.5 gap-1.5 ml-1.5 border-l border-zinc-200 dark:border-white/10 pl-1.5">
          {goal.tasks.map((t) => (
            <TaskLeaf
              key={t.id}
              task={t}
              indent={(depth + 1) * 16}
              onToggle={onToggleTask}
            />
          ))}
          {goal.children.map((c) => (
            <TreeNode
              key={c.id}
              goal={c}
              depth={depth + 1}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              onOpen={onOpen}
              onAddSubgoal={onAddSubgoal}
              onActions={onActions}
              onToggleTask={onToggleTask}
            />
          ))}
        </View>
      )}
    </View>
  );
});

const TaskLeaf = memo(function TaskLeaf({
  task,
  indent,
  onToggle,
}: {
  task: TreeTask;
  indent: number;
  onToggle: (id: string, status: string) => void;
}) {
  const done = task.status === "DONE";
  const label = task.title ?? task.text ?? "Untitled task";
  const handleToggle = useCallback(
    () => onToggle(task.id, task.status),
    [onToggle, task.id, task.status]
  );
  return (
    <View
      className="flex-row items-center gap-2 rounded-lg bg-zinc-50 dark:bg-[#13131F] px-3 py-2"
      style={{ marginLeft: indent - 8 }}
    >
      <Pressable onPress={handleToggle} hitSlop={8}>
        <View
          className={`h-5 w-5 rounded-full border-2 items-center justify-center ${
            done
              ? "bg-violet-500 border-violet-500"
              : "border-zinc-300 dark:border-white/20"
          }`}
        >
          {done && <Ionicons name="checkmark" size={10} color="#FFFFFF" />}
        </View>
      </Pressable>
      <Text
        className={`text-xs flex-1 ${
          done
            ? "text-zinc-400 dark:text-zinc-500 line-through"
            : "text-zinc-700 dark:text-zinc-200"
        }`}
      >
        {label}
      </Text>
    </View>
  );
});

// ─── Sheets ──────────────────────────────────────────────────────────────

function AddSubgoalSheet({
  parent,
  onClose,
  onSaved,
}: {
  parent: TreeGoal;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!text.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      await api.post(`/api/goals/${parent.id}/add-subgoal`, { text: text.trim() });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't add");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 bg-black/50 justify-end">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable onPress={() => {}}>
            <View className="rounded-t-2xl bg-white dark:bg-[#1E1E2E] p-5 pb-10">
              <Text className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
                Under
              </Text>
              <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
                {parent.title}
              </Text>

              <TextInput
                autoFocus
                value={text}
                onChangeText={setText}
                placeholder="What's the next step?"
                placeholderTextColor="#71717A"
                className="rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#13131F] px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100"
              />
              {err && (
                <Text className="mt-2 text-xs text-red-500">{err}</Text>
              )}
              <View className="mt-4 flex-row justify-end gap-2">
                <Pressable onPress={onClose} className="px-4 py-2">
                  <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  disabled={saving || !text.trim()}
                  onPress={save}
                  className="rounded-full bg-violet-600 px-4 py-2"
                  style={{
                    opacity: saving || !text.trim() ? 0.4 : 1,
                  }}
                >
                  <Text className="text-sm font-semibold text-white">
                    {saving ? "Adding…" : "Add"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function ActionSheet({
  goal,
  onClose,
  onAction,
}: {
  goal: TreeGoal;
  onClose: () => void;
  onAction: (action: "start" | "complete" | "archive" | "delete" | "restore") => void;
}) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 bg-black/50 justify-end">
        <Pressable onPress={() => {}}>
          <View className="rounded-t-2xl bg-white dark:bg-[#1E1E2E] p-4 pb-10">
            <Text className="text-xs text-zinc-500 dark:text-zinc-400 px-2 mb-2">
              {goal.title}
            </Text>
            {goal.status !== "IN_PROGRESS" && goal.status !== "COMPLETE" && (
              <SheetRow label="Start" icon="play" onPress={() => onAction("start")} />
            )}
            {goal.status !== "COMPLETE" && (
              <SheetRow
                label="Mark complete"
                icon="checkmark"
                onPress={() => onAction("complete")}
              />
            )}
            {goal.status !== "ARCHIVED" && (
              <SheetRow
                label="Archive"
                icon="archive-outline"
                onPress={() => onAction("archive")}
              />
            )}
            {goal.status === "ARCHIVED" && (
              <SheetRow
                label="Restore"
                icon="refresh-outline"
                onPress={() => onAction("restore")}
              />
            )}
            <SheetRow
              label="Delete"
              icon="trash-outline"
              danger
              onPress={() => onAction("delete")}
            />
            <SheetRow label="Cancel" icon="close" onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SheetRow({
  label,
  icon,
  onPress,
  danger,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 px-3 py-3 rounded-lg"
      style={{
        backgroundColor: "transparent",
      }}
    >
      <Ionicons name={icon} size={18} color={danger ? "#EF4444" : "#A78BFA"} />
      <Text
        className={`text-sm ${
          danger
            ? "text-red-500"
            : "text-zinc-800 dark:text-zinc-100"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

type Suggestion = {
  id: string;
  parentGoalId: string | null;
  parentGoalTitle: string | null;
  suggestedText: string;
  createdAt: string;
  source: {
    entryId: string;
    createdAt: string;
    excerpt: string;
  } | null;
};

function SuggestionsSheet({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [pending, setPending] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ suggestions: Suggestion[] }>(
        "/api/goals/suggestions"
      );
      setItems(res.suggestions ?? []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (
    id: string,
    action: "accept" | "dismiss" | "edit-accept",
    editedText?: string
  ) => {
    setPending((p) => new Set(p).add(id));
    try {
      await api.post("/api/goals/suggestions", { id, action, editedText });
      setItems((prev) => (prev ?? []).filter((x) => x.id !== id));
      setEditingId(null);
      onChanged();
    } catch {
      // silent; user can retry
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(id);
        return n;
      });
    }
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="rounded-t-2xl bg-white dark:bg-[#1E1E2E] max-h-[85%]">
          <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
            <Text className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Review suggestions
            </Text>
            <Pressable onPress={onClose} hitSlop={8} className="p-1">
              <Ionicons name="close" size={20} color="#71717A" />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          >
            {items === null ? (
              <View className="py-12 items-center">
                <ActivityIndicator color="#7C3AED" />
              </View>
            ) : items.length === 0 ? (
              <View className="py-12 items-center">
                <Text className="text-3xl mb-2">✨</Text>
                <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                  All caught up.
                </Text>
              </View>
            ) : (
              <View className="gap-3">
                {items.map((s) => {
                  const busy = pending.has(s.id);
                  const editing = editingId === s.id;
                  return (
                    <View
                      key={s.id}
                      className="rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#13131F] p-3"
                    >
                      <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                        {s.parentGoalTitle
                          ? `Under "${s.parentGoalTitle}"`
                          : "Top-level"}
                      </Text>
                      {editing ? (
                        <TextInput
                          autoFocus
                          value={editText}
                          onChangeText={setEditText}
                          multiline
                          placeholderTextColor="#71717A"
                          className="rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100"
                        />
                      ) : (
                        <Text className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                          {s.suggestedText}
                        </Text>
                      )}
                      {s.source && (
                        <Text className="mt-2 text-[10px] text-zinc-400 dark:text-zinc-500 italic">
                          from your {formatRelativeDate(s.source.createdAt)} entry
                          {s.source.excerpt ? ` — “${s.source.excerpt}”` : ""}
                        </Text>
                      )}
                      <View className="mt-3 flex-row justify-end gap-2">
                        {editing ? (
                          <>
                            <Pressable
                              onPress={() => setEditingId(null)}
                              className="px-3 py-1.5"
                            >
                              <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                                Cancel
                              </Text>
                            </Pressable>
                            <Pressable
                              disabled={busy || !editText.trim()}
                              onPress={() =>
                                act(s.id, "edit-accept", editText.trim())
                              }
                              className="rounded-full bg-violet-600 px-3 py-1.5"
                              style={{
                                opacity:
                                  busy || !editText.trim() ? 0.4 : 1,
                              }}
                            >
                              <Text className="text-xs font-semibold text-white">
                                Save + accept
                              </Text>
                            </Pressable>
                          </>
                        ) : (
                          <>
                            <Pressable
                              disabled={busy}
                              onPress={() => act(s.id, "dismiss")}
                              className="px-3 py-1.5"
                            >
                              <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                                Dismiss
                              </Text>
                            </Pressable>
                            <Pressable
                              disabled={busy}
                              onPress={() => {
                                setEditingId(s.id);
                                setEditText(s.suggestedText);
                              }}
                              className="px-3 py-1.5"
                            >
                              <Text className="text-xs text-zinc-700 dark:text-zinc-200">
                                Edit
                              </Text>
                            </Pressable>
                            <Pressable
                              disabled={busy}
                              onPress={() => act(s.id, "accept")}
                              className="rounded-full bg-violet-600 px-3 py-1.5"
                              style={{
                                opacity: busy ? 0.4 : 1,
                              }}
                            >
                              <Text className="text-xs font-semibold text-white">
                                Accept
                              </Text>
                            </Pressable>
                          </>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function GoalGroupIcon({
  name,
  color,
}: {
  name: GoalGroupMeta["icon"];
  color: string;
}) {
  const Icon =
    name === "Briefcase"
      ? Briefcase
      : name === "HeartPulse"
        ? HeartPulse
        : name === "Wallet"
          ? Wallet
          : name === "Users"
            ? Users
            : name === "Sprout"
              ? Sprout
              : Palette;
  return <Icon size={16} color={color} strokeWidth={2} />;
}
