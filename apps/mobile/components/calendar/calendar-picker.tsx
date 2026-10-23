import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import type { DeviceCalendar } from "@/lib/device-calendar";
import type { AcuityTokens } from "@/lib/theme/tokens";

/**
 * Pick the calendar Ripple writes tasks and planned blocks into. Grouped by
 * account ("iCloud", "you@gmail.com") so a Google calendar is easy to spot.
 */
export function CalendarPicker({
  calendars,
  selectedId,
  onSelect,
  tokens,
}: {
  calendars: DeviceCalendar[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  tokens: AcuityTokens;
}) {
  if (calendars.length === 0) {
    return (
      <Text className="text-xs leading-relaxed" style={{ color: tokens.textTer }}>
        No calendars on this phone accept new events. Add an account in your phone&apos;s Settings, then come back.
      </Text>
    );
  }
  const groups = new Map<string, DeviceCalendar[]>();
  for (const c of calendars) {
    const key = c.source || "On this phone";
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return (
    <View className="gap-3">
      {[...groups.entries()].map(([source, list]) => (
        <View key={source}>
          <Text
            className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: tokens.textTer }}
          >
            {source}
          </Text>
          <View className="gap-1.5">
            {list.map((c) => {
              const active = c.id === selectedId;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => onSelect(c.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  accessibilityLabel={`${c.title}, ${source}`}
                  className="flex-row items-center gap-3 rounded-lg border px-3 py-2.5"
                  style={{
                    borderColor: active ? tokens.primary : tokens.line,
                    backgroundColor: active ? `${tokens.primary}1A` : "transparent",
                  }}
                >
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: c.color ?? tokens.textTer,
                    }}
                  />
                  <Text className="flex-1 text-sm" style={{ color: tokens.text }} numberOfLines={1}>
                    {c.title}
                    {c.isDefault ? "  (default)" : ""}
                  </Text>
                  {active ? <Ionicons name="checkmark" size={18} color={tokens.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}
