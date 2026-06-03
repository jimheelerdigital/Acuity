import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useLock, useRefreshLockEnabled } from "@/contexts/lock-context";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import {
  AUTO_LOCK_OPTIONS,
  authenticate,
  getAutoLockMinutes,
  isLocalAuthCapable,
  isLockEnabled,
  setAutoLockMinutes,
  setLockEnabled,
  type AutoLockMinutes,
} from "@/lib/app-lock";

/**
 * Security settings screen. Owns:
 *   - "Require Face ID to unlock" toggle (App Lock on/off)
 *   - "Auto-lock after" picker (Immediately / 1m / 2m / 5m / 15m / Never)
 *
 * Mounts at /security. Reached from Profile → Preferences → Security.
 *
 * Auto-lock value is persisted to AsyncStorage (the lock-context
 * reads from there synchronously on every relevant AppState event)
 * AND mirrored to User.autoLockMinutes via /api/user/auto-lock so the
 * preference survives reinstall and follows the user across devices
 * (next /api/user/me re-hydrates the device value).
 *
 * The toggle requires the user to authenticate before flipping on —
 * prevents an attacker who picked up an unlocked phone from enabling
 * the lock to make sure they're the only one who can open the app.
 */

interface AutoLockOption {
  value: AutoLockMinutes;
  label: string;
  sublabel?: string;
}

const AUTO_LOCK_LABELS: Record<AutoLockMinutes, AutoLockOption> = {
  0: { value: 0, label: "Immediately", sublabel: "Lock the moment you leave the app" },
  1: { value: 1, label: "After 1 minute" },
  2: { value: 2, label: "After 2 minutes", sublabel: "Recommended" },
  5: { value: 5, label: "After 5 minutes" },
  15: { value: 15, label: "After 15 minutes" },
  [-1]: { value: -1, label: "Never", sublabel: "Only re-lock on a fresh launch" },
};

export default function SecurityScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const refreshLockNow = useRefreshLockEnabled();
  const { status } = useLock();
  const [lockEnabledLocal, setLockEnabledLocal] = useState<boolean | null>(
    null
  );
  const [autoLock, setAutoLock] = useState<AutoLockMinutes>(2);
  const [capable, setCapable] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);

  // Hydrate on mount — both the lock-enabled flag and the picker
  // value need to reflect persisted state before the user touches
  // anything.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      isLockEnabled(),
      isLocalAuthCapable(),
      getAutoLockMinutes(),
    ]).then(([enabled, isCapable, minutes]) => {
      if (cancelled) return;
      setLockEnabledLocal(enabled);
      setCapable(isCapable);
      setAutoLock(minutes);
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const handleToggleLock = useCallback(async () => {
    if (lockEnabledLocal === null || busy) return;
    setBusy(true);
    try {
      if (lockEnabledLocal) {
        // Turning OFF — confirm so users don't tap it by accident.
        Alert.alert(
          "Turn off app lock?",
          "Your entries will no longer require Face ID to open Acuity.",
          [
            { text: "Cancel", style: "cancel", onPress: () => setBusy(false) },
            {
              text: "Turn off",
              style: "destructive",
              onPress: async () => {
                await setLockEnabled(false);
                setLockEnabledLocal(false);
                setBusy(false);
              },
            },
          ]
        );
        return;
      }
      // Turning ON — require auth first so we never enable the lock
      // for a stolen unlocked phone.
      const res = await authenticate("Confirm to enable app lock");
      if (!res.success) {
        Alert.alert(
          "Couldn't enable lock",
          "Face ID or device passcode wasn't confirmed. Try again."
        );
        setBusy(false);
        return;
      }
      await setLockEnabled(true);
      setLockEnabledLocal(true);
      void refreshLockNow();
    } finally {
      // Don't clear busy here for the OFF path — the Alert callbacks
      // handle it. ON path always falls through.
      if (!lockEnabledLocal) setBusy(false);
    }
  }, [lockEnabledLocal, busy, refreshLockNow]);

  const handlePickAutoLock = useCallback(async (value: AutoLockMinutes) => {
    setAutoLock(value);
    await setAutoLockMinutes(value);
    // Mirror to server. Fire-and-forget — local AsyncStorage is the
    // authoritative source for the lock-context, server-side is for
    // cross-device sync via the next /me fetch.
    void api
      .post<{ ok: boolean }>("/api/user/auto-lock", { minutes: value })
      .catch(() => {
        /* non-fatal — local change still applies */
      });
  }, []);

  const headerColor = tokens.text;

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Security",
          headerStyle: { backgroundColor: tokens.bg },
          headerTintColor: headerColor,
          headerTitleStyle: { color: headerColor, fontWeight: "600" },
        }}
      />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 }}>
          {/* App Lock toggle */}
          <View
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: tokens.line,
              backgroundColor: tokens.cardBg,
              padding: 16,
              marginTop: 8,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: `${tokens.primary}22`,
                }}
              >
                <Ionicons name="lock-closed" size={18} color={tokens.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{ color: tokens.text, fontSize: 16, fontWeight: "600" }}
                >
                  Require Face ID to unlock
                </Text>
                <Text
                  style={{ color: tokens.textSec, fontSize: 13, marginTop: 2 }}
                >
                  {capable
                    ? "Use Face ID, Touch ID, or device passcode."
                    : "No biometry or passcode is set up on this device."}
                </Text>
              </View>
              <Pressable
                onPress={() => void handleToggleLock()}
                disabled={!capable || lockEnabledLocal === null || busy}
                accessibilityRole="switch"
                accessibilityState={{ checked: !!lockEnabledLocal }}
                style={{
                  height: 28,
                  width: 48,
                  borderRadius: 14,
                  justifyContent: "center",
                  backgroundColor: lockEnabledLocal
                    ? tokens.primary
                    : tokens.bgInset,
                  opacity: capable && lockEnabledLocal !== null ? 1 : 0.4,
                }}
              >
                <View
                  style={{
                    height: 24,
                    width: 24,
                    borderRadius: 12,
                    backgroundColor: "#FFFFFF",
                    transform: [{ translateX: lockEnabledLocal ? 22 : 2 }],
                  }}
                />
              </Pressable>
            </View>
          </View>

          {/* Auto-lock picker — only meaningful when app lock is on,
              but we keep it visible (disabled) when off so users see
              the choices they'll get on enabling. */}
          <Text
            style={{
              color: tokens.textTer,
              fontSize: 12,
              fontWeight: "600",
              letterSpacing: 0.5,
              textTransform: "uppercase",
              marginTop: 24,
              marginLeft: 4,
              marginBottom: 8,
            }}
          >
            Auto-lock after
          </Text>
          <View
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: tokens.line,
              backgroundColor: tokens.cardBg,
              overflow: "hidden",
              opacity: lockEnabledLocal ? 1 : 0.5,
            }}
            pointerEvents={lockEnabledLocal ? "auto" : "none"}
          >
            {AUTO_LOCK_OPTIONS.map((opt, idx) => {
              const meta = AUTO_LOCK_LABELS[opt];
              const selected = autoLock === opt;
              return (
                <Pressable
                  key={opt}
                  onPress={() => void handlePickAutoLock(opt)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderTopWidth: idx === 0 ? 0 : 1,
                    borderTopColor: tokens.line,
                    backgroundColor: pressed ? tokens.bgInset : "transparent",
                  })}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: tokens.text,
                        fontSize: 15,
                        fontWeight: selected ? "600" : "400",
                      }}
                    >
                      {meta.label}
                    </Text>
                    {meta.sublabel && (
                      <Text
                        style={{
                          color: tokens.textSec,
                          fontSize: 12,
                          marginTop: 2,
                        }}
                      >
                        {meta.sublabel}
                      </Text>
                    )}
                  </View>
                  {selected && (
                    <Ionicons
                      name="checkmark"
                      size={20}
                      color={tokens.primary}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>

          <Text
            style={{
              color: tokens.textTer,
              fontSize: 12,
              lineHeight: 18,
              marginTop: 16,
              marginHorizontal: 4,
            }}
          >
            We never lock the app while you&rsquo;re using it. Re-lock
            only happens when Acuity has been backgrounded longer than
            the interval above.
          </Text>

          {/* Back affordance for parity with screens that don't get
              the OS back gesture. The header's chevron is the primary
              path. */}
          <Pressable
            onPress={() => router.back()}
            style={{
              marginTop: 32,
              alignSelf: "center",
              paddingHorizontal: 24,
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: tokens.textSec, fontSize: 14 }}>Done</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
