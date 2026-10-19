import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";
import {
  dismissPill,
  exploredCount,
  showHomePill,
  useWhatsNewState,
} from "@/lib/whats-new-state";

/**
 * Home "New in 1.9.1 · 2 of 5 explored" pill (1.9.1). Opens Profile →
 * What's New. Only for people who updated (never fresh installs), for 7
 * days, until everything's explored or they close it. Rule:
 * lib/whats-new-state.ts showHomePill.
 */
export function WhatsNewPill() {
  const { tokens } = useTheme();
  const router = useRouter();
  const wn = useWhatsNewState();
  if (!showHomePill(wn) || !wn.release) return null;
  const { done, total } = exploredCount(wn);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        borderRadius: 999,
        backgroundColor: `${tokens.primary}1A`,
        borderWidth: 1,
        borderColor: `${tokens.primary}40`,
        marginBottom: 16,
      }}
    >
      <Pressable
        onPress={() => router.push("/whats-new" as never)}
        accessibilityRole="button"
        accessibilityLabel={`What's new in ${wn.release.version}, ${done} of ${total} explored`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingLeft: 12,
          paddingRight: 6,
          paddingVertical: 8,
        }}
      >
        <Ionicons name="sparkles" size={14} color={tokens.primary} />
        <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, fontWeight: "600", color: tokens.primary }}>
          New in {wn.release.version}
        </Text>
        <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, color: tokens.textSec }}>
          · {done} of {total} explored ›
        </Text>
      </Pressable>
      <Pressable
        onPress={dismissPill}
        accessibilityRole="button"
        accessibilityLabel="Hide"
        hitSlop={10}
        style={{ paddingRight: 12, paddingLeft: 4, paddingVertical: 8 }}
      >
        <Ionicons name="close" size={14} color={tokens.textTer} />
      </Pressable>
    </View>
  );
}
