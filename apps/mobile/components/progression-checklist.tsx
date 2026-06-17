import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { ProgressionItemKey } from "@acuity/shared";

import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";

/**
 * Mobile counterpart to apps/web/src/components/progression-checklist.tsx.
 * Same server endpoint (/api/progression), same 7-item 7-day schedule,
 * same progress-bar + collapse + hide affordances. Rendered on Home
 * for users in their first 7 days.
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
  const { tokens } = useTheme();
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
    <View
      className="mb-6 rounded-2xl border p-4"
      style={{ borderColor: tokens.line, backgroundColor: tokens.cardBg }}
    >
      <View className="flex-row items-start justify-between gap-3 mb-3">
        <View className="flex-1">
          <Text
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: tokens.textTer }}
          >
            Getting to know Acuity
          </Text>
          <Text
            className="mt-1 text-xs"
            style={{ color: tokens.textSec }}
          >
            {done} of {items.length} complete · unlocks over one week
          </Text>
        </View>
        <View className="flex-row gap-1">
          <Pressable
            onPress={() => setCollapsed((c) => !c)}
            hitSlop={8}
            className="rounded px-2 py-1"
          >
            <Text className="text-xs" style={{ color: tokens.textSec }}>
              {collapsed ? "Expand" : "Collapse"}
            </Text>
          </Pressable>
          <Pressable onPress={dismiss} hitSlop={8} className="rounded px-2 py-1">
            <Text className="text-xs" style={{ color: tokens.textTer }}>
              Hide
            </Text>
          </Pressable>
        </View>
      </View>

      <View
        className="h-1.5 overflow-hidden rounded-full"
        style={{ backgroundColor: tokens.bgInset }}
      >
        <View
          className="h-full rounded-full"
          style={{ width: `${progress}%`, backgroundColor: tokens.primary }}
        />
      </View>

      {!collapsed && (
        <View className="mt-3 gap-2">
          {items.map((item) => (
            <View
              key={item.key}
              className="flex-row items-center gap-3 rounded-lg border px-3 py-2"
              style={{ borderColor: tokens.line }}
            >
              <Pressable
                onPress={() => !item.completed && markComplete(item.key)}
                accessibilityRole="button"
                accessibilityLabel={
                  item.completed ? "Completed" : "Mark complete"
                }
                className="h-6 w-6 items-center justify-center rounded-full border-2"
                style={{
                  borderColor: item.completed ? tokens.primary : tokens.line,
                  backgroundColor: item.completed
                    ? tokens.primary
                    : "transparent",
                }}
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
                  className={`text-sm font-medium ${item.completed ? "line-through" : ""}`}
                  style={{
                    color: item.completed ? tokens.textTer : tokens.text,
                  }}
                >
                  {item.title}
                </Text>
                <Text
                  className="mt-0.5 text-xs"
                  style={{ color: tokens.textSec }}
                >
                  {item.description}
                </Text>
              </Pressable>
              {!item.completed && (
                <Pressable
                  onPress={() => router.push(mapWebHrefToMobile(item.href))}
                  hitSlop={6}
                >
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: tokens.primary }}
                  >
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
