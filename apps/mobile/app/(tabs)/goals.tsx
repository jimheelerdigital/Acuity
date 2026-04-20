import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/lib/api";

type Goal = {
  id: string;
  title: string;
  description: string | null;
  lifeArea: string;
  status: string;
  progress: number;
  targetDate: string | null;
  createdAt: string;
};

// Canonical 6 areas — must match @acuity/shared `LIFE_AREAS`.
const LIFE_AREAS: Record<string, { label: string; color: string }> = {
  CAREER: { label: "Career", color: "#3B82F6" },
  HEALTH: { label: "Health", color: "#14B8A6" },
  RELATIONSHIPS: { label: "Relationships", color: "#F43F5E" },
  FINANCES: { label: "Finances", color: "#F59E0B" },
  PERSONAL: { label: "Personal Growth", color: "#A855F7" },
  OTHER: { label: "Other", color: "#71717A" },
};

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: "Active", color: "#34D399" },
  COMPLETED: { label: "Completed", color: "#A78BFA" },
  PAUSED: { label: "Paused", color: "#FBBF24" },
  ABANDONED: { label: "Archived", color: "#71717A" },
};

export default function GoalsTab() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchGoals = useCallback(async () => {
    try {
      const data = await api.get<{ goals: Goal[] }>("/api/goals");
      setGoals(data.goals ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchGoals();
  }, [fetchGoals]);

  const sections = useMemo(() => {
    const map = new Map<string, Goal[]>();
    for (const g of goals) {
      const key = g.lifeArea || "PERSONAL";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(g);
    }
    return Array.from(map.entries()).map(([area, data]) => ({
      title: area,
      data,
    }));
  }, [goals]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-zinc-950 items-center justify-center" edges={["top"]}>
        <ActivityIndicator color="#7C3AED" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-zinc-950" edges={["top"]}>
      <View className="px-5 pt-4 pb-2">
        <View className="flex-row items-baseline gap-2">
          <Text className="text-2xl font-bold text-zinc-50">Goals</Text>
          {goals.filter((g) => g.status === "ACTIVE").length > 0 && (
            <Text className="text-sm text-zinc-500">
              {goals.filter((g) => g.status === "ACTIVE").length} active
            </Text>
          )}
        </View>
        <Text className="text-sm text-zinc-400 mt-1">
          What you&apos;re working toward
        </Text>
      </View>

      {goals.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3">
          <Ionicons name="trophy-outline" size={48} color="#52525B" />
          <Text className="text-base font-semibold text-zinc-300">
            No goals yet
          </Text>
          <Text className="text-sm text-zinc-500 text-center px-10">
            Mention a goal in your brain dump and we&apos;ll track it here.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 0 }}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#7C3AED"
            />
          }
          renderSectionHeader={({ section }) => {
            const area = LIFE_AREAS[section.title] ?? {
              label: section.title,
              color: "#71717A",
            };
            return (
              <View className="flex-row items-center gap-2 mb-3 mt-4">
                <View
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: area.color }}
                />
                <Text className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                  {area.label}
                </Text>
              </View>
            );
          }}
          renderItem={({ item }) => <GoalCard goal={item} />}
        />
      )}
    </SafeAreaView>
  );
}

function GoalCard({ goal }: { goal: Goal }) {
  const area = LIFE_AREAS[goal.lifeArea] ?? { label: goal.lifeArea, color: "#71717A" };
  const status = STATUS_STYLES[goal.status] ?? STATUS_STYLES.ACTIVE;

  return (
    <View className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 mb-2.5">
      {/* Status + target date */}
      <View className="flex-row items-center gap-2 mb-1.5">
        <View
          className="rounded-full px-2 py-0.5"
          style={{ backgroundColor: status.color + "20" }}
        >
          <Text style={{ color: status.color, fontSize: 11, fontWeight: "600" }}>
            {status.label}
          </Text>
        </View>
        <View
          className="rounded-full px-2 py-0.5"
          style={{ backgroundColor: area.color + "18" }}
        >
          <Text style={{ color: area.color, fontSize: 11, fontWeight: "600" }}>
            {area.label}
          </Text>
        </View>
        {goal.targetDate && (
          <Text className="text-xs text-zinc-500">
            Target{" "}
            {new Date(goal.targetDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </Text>
        )}
      </View>

      {/* Title */}
      <Text
        className={`text-sm leading-snug ${
          goal.status === "COMPLETED" || goal.status === "ABANDONED"
            ? "text-zinc-500 line-through"
            : "text-zinc-200"
        }`}
      >
        {goal.title}
      </Text>

      {goal.description && (
        <Text className="text-xs text-zinc-500 mt-1" numberOfLines={2}>
          {goal.description}
        </Text>
      )}

      {/* Progress bar */}
      <View className="flex-row items-center gap-3 mt-3">
        <View className="flex-1 h-1.5 rounded-full bg-zinc-800">
          <View
            className="h-1.5 rounded-full bg-violet-500"
            style={{ width: `${goal.progress}%` }}
          />
        </View>
        <Text className="text-xs font-medium text-zinc-500 w-8 text-right">
          {goal.progress}%
        </Text>
      </View>
    </View>
  );
}
