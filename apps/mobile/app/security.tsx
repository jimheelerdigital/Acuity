import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/auth-context";
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
 * Hardened 2026-06-03 (P0 pass):
 *   - Bug 3 (state desync) — the prior version had `[status]` in the
 *     hydration useEffect's dep array. Every time the lock state
 *     changed (background → foreground → re-lock → unlock cycle), it
 *     re-ran the AsyncStorage read and overwrote the local picker
 *     state. If the in-flight setAutoLockMinutes write hadn't yet
 *     flushed to AsyncStorage, the picker snapped back to the
 *     pre-pick value. Fix: hydrate once on mount only; track a
 *     "dirty" flag so subsequent re-renders don't overwrite a
 *     user-initiated pick.
 *   - Prefer the server value (User.autoLockMinutes from useAuth)
 *     when AsyncStorage is empty (fresh install on a returning user).
 *
 * Auto-lock value is persisted to AsyncStorage (the lock-context
 * reads its synchronous cache from there on every relevant AppState
 * event) AND mirrored to User.autoLockMinutes via /api/user/auto-lock
 * so the preference survives reinstall and follows the user across
 * devices.
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
  const { user } = useAuth();
  const refreshLockNow = useRefreshLockEnabled();
  const { status } = useLock();
  const [lockEnabledLocal, setLockEnabledLocal] = useState<boolean | null>(
    null
  );
  const [autoLock, setAutoLock] = useState<AutoLockMinutes>(2);
  const [capable, setCapable] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);
  // Dirty flag — once the user has picked an option here, ignore any
  // late-arriving hydration from server / storage. Prevents Bug 3.
  const dirtyRef = useRef(false);

  // Hydrate ONCE on mount. The prior version depended on `status` and
  // re-fired on every lock-state transition, which trampled the user's
  // picker selection. Empty dep array = mount-only.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      isLockEnabled(),
      isLocalAuthCapable(),
      getAutoLockMinutes(),
    ]).then(([enabled, isCapable, storedMinutes]) => {
      if (cancelled) return;
      setLockEnabledLocal(enabled);
      setCapable(isCapable);
      if (!dirtyRef.current) {
        // Prefer the server value if it exists AND local storage is
        // the default. This handles the case where the user picked
        // an interval on another device — we shouldn't show a stale
        // "After 2 minutes" before /me's value lands.
        const serverValue = (user as { autoLockMinutes?: number } | null)
          ?.autoLockMinutes;
        if (
          typeof serverValue === "number" &&
          AUTO_LOCK_OPTIONS.includes(serverValue as AutoLockMinutes) &&
          storedMinutes === 2 // local is default — server likely fresher
        ) {
          setAutoLock(serverValue as AutoLockMinutes);
        } else {
          setAutoLock(storedMinutes);
        }
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    dirtyRef.current = true;
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

  // Avoid unused-var warning on `status` — it's read implicitly by
  // useLock to keep the hook subscribed. Profile-pattern parity.
  void status;

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Security",
          headerStyle: { backgroundColor: tokens.bg },
          headerTintColor: tokens.text,
          headerTitleStyle: { color: tokens.text, fontWeight: "600" },
        }}
      />
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 40,
          }}
        >
          {/* APP LOCK group */}
          <SectionLabel tokens={tokens} text="App lock" />
          <ToggleRow
            tokens={tokens}
            icon="lock-closed-outline"
            label="Require Face ID to unlock"
            sublabel={
              capable
                ? "Use Face ID, Touch ID, or device passcode."
                : "No biometry or passcode is set up on this device."
            }
            value={!!lockEnabledLocal}
            disabled={!capable || lockEnabledLocal === null || busy}
            onToggle={() => void handleToggleLock()}
          />

          {/* AUTO-LOCK group */}
          <SectionLabel tokens={tokens} text="Auto-lock after" />
          <View
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: tokens.cardBorder,
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
                <PickerRow
                  key={opt}
                  tokens={tokens}
                  label={meta.label}
                  sublabel={meta.sublabel}
                  selected={selected}
                  isFirst={idx === 0}
                  onPress={() => void handlePickAutoLock(opt)}
                />
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

          {/* Done — back affordance for parity with screens that
              don't get the OS back gesture. The header's chevron is
              the primary path. */}
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

// ─── Sub-components ──────────────────────────────────────────────────

function SectionLabel({
  tokens,
  text,
}: {
  tokens: ReturnType<typeof useTheme>["tokens"];
  text: string;
}) {
  return (
    <Text
      style={{
        fontFamily: tokens.fontMono,
        fontSize: 10,
        fontWeight: "700",
        letterSpacing: 1.4,
        color: tokens.textTer,
        paddingHorizontal: 4,
        textTransform: "uppercase",
        marginTop: 16,
        marginBottom: 8,
      }}
    >
      {text}
    </Text>
  );
}

function ToggleRow({
  tokens,
  icon,
  label,
  sublabel,
  value,
  disabled,
  onToggle,
}: {
  tokens: ReturnType<typeof useTheme>["tokens"];
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  sublabel?: string;
  value: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        borderRadius: tokens.radius.lg,
        backgroundColor: tokens.cardBg,
        borderWidth: 1,
        borderColor: tokens.cardBorder,
        paddingHorizontal: 16,
        paddingVertical: 14,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Ionicons name={icon} size={20} color={tokens.textSec} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 15,
            fontWeight: "500",
            color: tokens.text,
          }}
        >
          {label}
        </Text>
        {sublabel && (
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 13,
              fontWeight: "400",
              color: tokens.textTer,
            }}
          >
            {sublabel}
          </Text>
        )}
      </View>
      <View
        style={{
          height: 28,
          width: 48,
          borderRadius: 14,
          justifyContent: "center",
          backgroundColor: value ? tokens.primary : tokens.bgInset,
        }}
      >
        <View
          style={{
            height: 24,
            width: 24,
            borderRadius: 12,
            backgroundColor: "#FFFFFF",
            transform: [{ translateX: value ? 22 : 2 }],
          }}
        />
      </View>
    </Pressable>
  );
}

function PickerRow({
  tokens,
  label,
  sublabel,
  selected,
  isFirst,
  onPress,
}: {
  tokens: ReturnType<typeof useTheme>["tokens"];
  label: string;
  sublabel?: string;
  selected: boolean;
  isFirst: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderTopWidth: isFirst ? 0 : 1,
        borderTopColor: tokens.cardBorder,
        backgroundColor: pressed ? tokens.bgInset : "transparent",
      })}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: tokens.text,
            fontSize: 15,
            fontWeight: selected ? "600" : "400",
            fontFamily: tokens.fontSans,
          }}
        >
          {label}
        </Text>
        {sublabel && (
          <Text
            style={{
              color: tokens.textSec,
              fontSize: 12,
              marginTop: 2,
              fontFamily: tokens.fontSans,
            }}
          >
            {sublabel}
          </Text>
        )}
      </View>
      {/* Unambiguous right-side checkmark on the chosen row. Larger
          tap-target ring + bolder coral stroke than the v1 dim glyph
          so the selection state reads at a glance, especially on
          dense lists. */}
      {selected && (
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: `${tokens.primary}1f`,
            alignItems: "center",
            justifyContent: "center",
            marginLeft: 8,
          }}
        >
          <Ionicons name="checkmark" size={18} color={tokens.primary} />
        </View>
      )}
    </Pressable>
  );
}
