import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useLock } from "@/contexts/lock-context";
import { useTheme } from "@/contexts/theme-context";
import { isLocalAuthCapable } from "@/lib/app-lock";

/**
 * Full-screen overlay rendered above the route tree when the app
 * lock is engaged. Mounted in _layout.tsx ThemedApp so it sits
 * above <Stack/>.
 *
 * Auto-prompts Face ID ONCE on entry into "locked". If the user
 * cancels, the overlay stays up with a retry button — we do NOT
 * re-fire the OS prompt automatically (that was the v1.2 bug:
 * useEffect dep churn re-triggered the dialog endlessly when paired
 * with the lock-context loop).
 *
 * After 3 consecutive cancels/failures we surface a "Use device
 * passcode" hint — `authenticate()` passes `disableDeviceFallback:
 * false`, so tapping Unlock again after 3 biometry failures lets
 * iOS auto-fall-back to the OS passcode prompt. We tell the user
 * that explicitly so they don't think they're trapped.
 *
 * v1.3.x (2026-06-03): if `isLocalAuthCapable()` returns false at
 * mount (covered camera, recently disabled biometry, hardware
 * issue), surface a recovery message instead of leaving the user
 * on a blank locked screen. They can still tap Unlock — iOS will
 * fall through to the device passcode if biometry's unavailable.
 *
 * "checking" status renders the same neutral background as the
 * locked state, but without the unlock CTA, to avoid a flash of
 * content during the SecureStore read on cold launch.
 */
export function LockScreenOverlay() {
  const { status, unlock } = useLock();
  const { tokens } = useTheme();
  const promptedFor = useRef<"locked" | null>(null);
  const [attempts, setAttempts] = useState(0);
  // null = haven't probed yet; once resolved, stays stable for the
  // life of the overlay. Used purely for the messaging — Unlock
  // still tries authenticate() because iOS handles the fallback.
  const [capable, setCapable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void isLocalAuthCapable().then((c) => {
      if (!cancelled) setCapable(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-prompt biometric exactly ONCE per locked entry. Tracked via
  // a ref keyed on the status — when we leave "locked" the ref
  // clears so the next time the lock engages we re-prompt fresh.
  useEffect(() => {
    if (status === "locked" && promptedFor.current !== "locked") {
      promptedFor.current = "locked";
      void unlock();
    }
    if (status === "unlocked") {
      promptedFor.current = null;
      if (attempts !== 0) setAttempts(0);
    }
  }, [status, unlock, attempts]);

  const handleRetry = async () => {
    setAttempts((n) => n + 1);
    await unlock();
  };

  if (status === "unlocked") return null;

  const showPasscodeHint = attempts >= 3 && status === "locked";
  const showCapabilityHint = capable === false && status === "locked";

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: tokens.bg,
        zIndex: 9999,
      }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <View className="flex-1 items-center justify-center px-6">
          <View
            className="h-16 w-16 rounded-2xl items-center justify-center border mb-6"
            style={{
              backgroundColor: `${tokens.primary}33`,
              borderColor: `${tokens.primary}4d`,
            }}
          >
            <Ionicons name="lock-closed" size={28} color={tokens.primary} />
          </View>
          <Text
            className="text-2xl font-semibold text-center"
            style={{ color: tokens.text }}
          >
            Acuity is locked
          </Text>
          <Text
            className="mt-3 text-base text-center leading-relaxed"
            style={{ color: tokens.textSec }}
          >
            Your entries are private. Authenticate to continue.
          </Text>
          {status === "locked" && (
            <Pressable
              onPress={() => void handleRetry()}
              className="mt-10 rounded-full px-8 py-3.5"
              style={{ backgroundColor: tokens.primary }}
            >
              <Text
                className="text-sm font-semibold"
                style={{ color: "#FFFFFF" }}
              >
                Unlock
              </Text>
            </Pressable>
          )}
          {showCapabilityHint && (
            <Text
              className="mt-6 text-xs text-center leading-relaxed px-2"
              style={{ color: tokens.textTer }}
            >
              Face ID isn&rsquo;t available right now. Tap Unlock and
              use your device passcode instead.
            </Text>
          )}
          {showPasscodeHint && !showCapabilityHint && (
            <Text
              className="mt-6 text-xs text-center leading-relaxed px-2"
              style={{ color: tokens.textTer }}
            >
              Trouble with Face ID? Tap Unlock and choose
              &ldquo;Use Passcode&rdquo; on the system prompt.
            </Text>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
