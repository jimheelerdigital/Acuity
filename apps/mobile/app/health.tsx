import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { StickyBackButton } from "@/components/back-button";
import { useTheme } from "@/contexts/theme-context";
import {
  connectHealth,
  disconnectHealth,
  healthAvailable,
  isHealthEnabled,
  syncHealth,
} from "@/lib/health";

/**
 * Profile → Apple Health (1.9.6). Connect / disconnect the read-only
 * HealthKit sync (lib/health.ts) and say plainly what is shared.
 */

type State =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "off" }
  | { kind: "on"; note: string | null }
  | { kind: "working" };

const SHARED = [
  { icon: "footsteps-outline", label: "Steps" },
  { icon: "flame-outline", label: "Exercise minutes" },
  { icon: "moon-outline", label: "Sleep" },
  { icon: "pulse-outline", label: "Heart rate variability" },
] as const;

export default function HealthScreen() {
  const { tokens } = useTheme();
  const [state, setState] = useState<State>({ kind: "loading" });

  const refresh = useCallback(async () => {
    if (!(await healthAvailable())) return setState({ kind: "unavailable" });
    setState((await isHealthEnabled()) ? { kind: "on", note: null } : { kind: "off" });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connect = async () => {
    setState({ kind: "working" });
    const ok = await connectHealth();
    setState(ok ? { kind: "on", note: "Connected. Your last week is synced." } : { kind: "off" });
  };

  const syncNow = async () => {
    setState({ kind: "working" });
    const res = await syncHealth({ force: true });
    setState({
      kind: "on",
      note: res
        ? res.uploaded > 0
          ? `Synced ${res.uploaded} day${res.uploaded === 1 ? "" : "s"}.`
          : "Nothing to sync yet. Check Ripple is allowed in the Health app."
        : "Couldn't sync right now. Try again in a moment.",
    });
  };

  const disconnect = async () => {
    await disconnectHealth();
    setState({ kind: "off" });
  };

  const card = { borderColor: tokens.line, backgroundColor: tokens.cardBg };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: tokens.bg }} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StickyBackButton accessibilityLabel="Back to Profile" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 80, paddingBottom: 40 }}>
        <Text className="text-2xl font-bold" style={{ color: tokens.text }}>
          Apple Health
        </Text>
        <Text className="mt-1 mb-6 text-sm" style={{ color: tokens.textTer, lineHeight: 20 }}>
          See how sleep and movement line up with your mood, and let habits like "10,000 steps" check
          themselves off.
        </Text>

        <View className="rounded-xl border p-4 mb-4" style={card}>
          <Text className="text-xs font-semibold mb-3" style={{ color: tokens.textSec }}>
            WHAT RIPPLE READS
          </Text>
          {SHARED.map((s) => (
            <View key={s.label} className="flex-row items-center mb-2">
              <Ionicons name={s.icon} size={18} color={tokens.primary} />
              <Text className="text-sm ml-3" style={{ color: tokens.text }}>
                {s.label}
              </Text>
            </View>
          ))}
          <Text className="text-xs mt-2" style={{ color: tokens.textTer, lineHeight: 18 }}>
            Only daily totals for the last week leave your phone. Ripple never writes to Health and
            never sees individual readings.
          </Text>
        </View>

        {state.kind === "loading" || state.kind === "working" ? (
          <ActivityIndicator color={tokens.primary} style={{ marginTop: 12 }} />
        ) : state.kind === "unavailable" ? (
          <Text className="text-sm" style={{ color: tokens.textSec, lineHeight: 20 }}>
            Apple Health isn't available on this device.
          </Text>
        ) : state.kind === "off" ? (
          <Pressable
            onPress={() => void connect()}
            className="rounded-xl py-3.5 items-center"
            style={{ backgroundColor: tokens.primary }}
            accessibilityRole="button"
          >
            <Text className="text-base font-semibold" style={{ color: "#fff" }}>
              Connect Apple Health
            </Text>
          </Pressable>
        ) : (
          <View>
            <View className="flex-row items-center mb-3">
              <Ionicons name="checkmark-circle" size={20} color={tokens.primary} />
              <Text className="text-sm font-semibold ml-2" style={{ color: tokens.text }}>
                Connected
              </Text>
            </View>
            {state.note ? (
              <Text className="text-sm mb-3" style={{ color: tokens.textSec, lineHeight: 20 }}>
                {state.note}
              </Text>
            ) : null}
            <Pressable
              onPress={() => void syncNow()}
              className="rounded-xl py-3 items-center border mb-3"
              style={{ borderColor: tokens.line }}
              accessibilityRole="button"
            >
              <Text className="text-sm font-semibold" style={{ color: tokens.primary }}>
                Sync now
              </Text>
            </Pressable>
            <Text className="text-xs mb-4" style={{ color: tokens.textTer, lineHeight: 18 }}>
              To change what Ripple can read, open Health → your profile → Apps → Ripple.
            </Text>
            <Pressable onPress={() => void Linking.openURL("x-apple-health://")} accessibilityRole="link">
              <Text className="text-sm mb-6" style={{ color: tokens.primary }}>
                Open the Health app
              </Text>
            </Pressable>
            <Pressable onPress={() => void disconnect()} accessibilityRole="button">
              <Text className="text-sm" style={{ color: tokens.bad }}>
                Stop syncing
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
