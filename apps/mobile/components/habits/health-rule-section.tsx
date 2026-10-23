import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Platform, Pressable, Text, View } from "react-native";

import {
  HEALTH_RULE_PRESETS,
  healthRuleLabel,
  type HabitHealthRule,
  type HealthRuleMetric,
} from "@acuity/shared";

import { useTheme } from "@/contexts/theme-context";
import { isHealthEnabled, syncHealth } from "@/lib/health";
import { updateHabit, type Habit } from "@/lib/habits-api";

/**
 * Habit detail → "Auto-complete from Apple Health" (1.9.6). One rule per
 * habit: steps or exercise minutes at or over a preset. The server checks
 * the habit off when a day's Health totals meet it (never un-checks).
 * iOS only; asks to connect Health first when it isn't.
 */
export function HealthRuleSection({
  habit,
  onUpdated,
  labelStyle,
}: {
  habit: Habit;
  onUpdated: (h: Habit) => void;
  labelStyle: object;
}) {
  const { tokens } = useTheme();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const rule = habit.autoRule ?? null;

  useEffect(() => {
    void isHealthEnabled().then(setConnected);
  }, []);

  if (Platform.OS !== "ios" || habit.type === "reflection") return null;

  const save = async (next: HabitHealthRule | null) => {
    if (saving) return;
    setSaving(true);
    try {
      const updated = await updateHabit(habit.id, { autoRule: next });
      if (updated) onUpdated({ ...habit, ...updated });
      // Re-send the last week so a goal already met today checks off now.
      if (next) void syncHealth({ force: true });
    } catch {
      Alert.alert("Couldn't save", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const chip = (metric: HealthRuleMetric, threshold: number) => {
    const on = rule?.metric === metric && rule.threshold === threshold;
    const label = metric === "steps" ? `${threshold / 1000}k` : `${threshold}m`;
    return (
      <Pressable
        key={`${metric}-${threshold}`}
        onPress={() => void save(on ? null : { metric, comparator: ">=", threshold })}
        disabled={saving}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={
          metric === "steps" ? `${threshold.toLocaleString()} steps` : `${threshold} exercise minutes`
        }
        style={{
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 16,
          backgroundColor: on ? tokens.primary : tokens.bgSub,
          opacity: saving ? 0.6 : 1,
        }}
      >
        <Text style={{ color: on ? "#FFFFFF" : tokens.textSec, fontSize: 13, fontWeight: "600" }}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View>
      <Text style={labelStyle}>Auto-complete from Apple Health</Text>
      <View
        style={{
          borderRadius: 16,
          backgroundColor: tokens.bgInset,
          borderWidth: 1,
          borderColor: tokens.lineStrong,
          padding: 16,
        }}
      >
        {connected === false ? (
          <>
            <Text style={{ color: tokens.textSec, fontSize: 14, lineHeight: 20 }}>
              Connect Apple Health and this habit can check itself off, like when you hit a step
              goal.
            </Text>
            <Pressable
              onPress={() => router.push("/health" as never)}
              style={{ flexDirection: "row", alignItems: "center", marginTop: 12, gap: 6 }}
              accessibilityRole="button"
            >
              <Ionicons name="heart-outline" size={16} color={tokens.primary} />
              <Text style={{ color: tokens.primary, fontSize: 14, fontWeight: "600" }}>
                Connect Apple Health
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={{ color: tokens.text, fontSize: 15, marginBottom: 4 }}>
              {rule ? `On: ${healthRuleLabel(rule)} a day` : "Off"}
            </Text>
            <Text style={{ color: tokens.textTer, fontSize: 12, lineHeight: 17, marginBottom: 12 }}>
              Checks off once your Health data updates, usually when you open Ripple. Tap the
              selected goal again to turn it off.
            </Text>
            <Text style={{ color: tokens.textSec, fontSize: 12, marginBottom: 6 }}>Steps</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {HEALTH_RULE_PRESETS.steps.map((t) => chip("steps", t))}
            </View>
            <Text style={{ color: tokens.textSec, fontSize: 12, marginBottom: 6 }}>
              Exercise minutes
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {HEALTH_RULE_PRESETS.activeMinutes.map((t) => chip("activeMinutes", t))}
            </View>
          </>
        )}
      </View>
    </View>
  );
}
