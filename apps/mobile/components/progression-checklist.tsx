import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { ProgressionItemKey } from "@acuity/shared";

import { api } from "@/lib/api";

/**
 * Mobile counterpart to apps/web/src/components/progression-checklist.tsx.
 * Same server endpoint (/api/progression), same 7-item 14-day schedule,
 * same progress-bar + collapse + hide affordances. Rendered on Home
 * for users in their first 14 days.
 */

interface Item {
  key: ProgressionItemKey;
  title: string;
  description: string;
  href: string;
  completed: boolean;
}

export function ProgressionChecklist({
  items: initial,
  completedCount,
  totalVisibleCount,
}: {
  items: Item[];
  completedCount: number;
  totalVisibleCount: number;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(initial);
  const [collapsed, setCollapsed] = useState(false);
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  const progress = Math.round(
    (completedCount / Math.max(1, totalVisibleCount)) * 100
  );
  const done = items.filter((i) => i.completed).length;

  const markComplete = (key: ProgressionItemKey) => {
    setItems((prev) =>
      prev.map((i) => (i.key === key ? { ...i, completed: true } : i))
    );
    api
      .post("/api/progression", { action: "complete", key })
      .catch(() => {});
  };

  const dismiss = () => {
    setHidden(true);
    api.post("/api/progression", { action: "dismiss" }).catch(() => {});
  };

  return (
    <View className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-[#1E1E2E]">
      <View className="flex-row items-start justify-between gap-3 mb-3">
        <View className="flex-1">
          <Text className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Getting to know Acuity
          </Text>
          <Text className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {done} of {items.length} complete · unlocks over two weeks
          </Text>
        </View>
        <View className="flex-row gap-1">
          <Pressable
            onPress={() => setCollapsed((c) => !c)}
            hitSlop={8}
            className="rounded px-2 py-1"
          >
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">
              {collapsed ? "Expand" : "Collapse"}
            </Text>
          </Pressable>
          <Pressable onPress={dismiss} hitSlop={8} className="rounded px-2 py-1">
            <Text className="text-xs text-zinc-400 dark:text-zinc-500">
              Hide
            </Text>
          </Pressable>
        </View>
      </View>

      <View className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
        <View
          className="h-full rounded-full bg-violet-500"
          style={{ width: `${progress}%` }}
        />
      </View>

      {!collapsed && (
        <View className="mt-3 gap-2">
          {items.map((item) => (
            <View
              key={item.key}
              className="flex-row items-center gap-3 rounded-lg border border-zinc-100 px-3 py-2 dark:border-white/5"
            >
              <Pressable
                onPress={() => !item.completed && markComplete(item.key)}
                accessibilityRole="button"
                accessibilityLabel={
                  item.completed ? "Completed" : "Mark complete"
                }
                className={`h-6 w-6 items-center justify-center rounded-full border-2 ${
                  item.completed
                    ? "border-violet-500 bg-violet-500"
                    : "border-zinc-300 dark:border-white/20"
                }`}
                disabled={item.completed}
              >
                {item.completed && (
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                )}
              </Pressable>
              <Pressable
                onPress={() => router.push(mapWebHrefToMobile(item.href))}
                className="flex-1"
              >
                <Text
                  className={`text-sm font-medium ${
                    item.completed
                      ? "text-zinc-400 dark:text-zinc-500 line-through"
                      : "text-zinc-900 dark:text-zinc-50"
                  }`}
                >
                  {item.title}
                </Text>
                <Text className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {item.description}
                </Text>
              </Pressable>
              {!item.completed && (
                <Pressable
                  onPress={() => router.push(mapWebHrefToMobile(item.href))}
                  hitSlop={6}
                >
                  <Text className="text-xs font-semibold text-violet-600 dark:text-violet-400">
                    Open →
                  </Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * The shared progression items carry web hrefs like "/record" or
 * "/entries". Mobile routing uses Expo Router; tab paths live under
 * `/(tabs)/`. Mapping is a fixed lookup — no regex acrobatics.
 */
function mapWebHrefToMobile(webHref: string): Href {
  const map: Record<string, Href> = {
    "/record": "/record",
    "/entries": "/(tabs)/entries",
    "/insights": "/(tabs)/insights",
    "/goals": "/(tabs)/goals",
  };
  return map[webHref] ?? "/(tabs)/";
}
