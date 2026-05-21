import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useLock } from "@/contexts/lock-context";
import { useTheme } from "@/contexts/theme-context";

/**
 * Full-screen overlay rendered above the route tree when the app
 * lock is engaged. Mounted in _layout.tsx ThemedApp so it sits
 * above <Stack/>.
 *
 * Auto-prompts Face ID on mount (locked state entry) so users don't
 * have to tap to start — the OS dialog appears immediately. If they
 * cancel, the overlay stays up with a "Unlock" CTA so they can retry.
 *
 * "checking" status renders the same neutral dark background as the
 * locked state, but without the unlock CTA, to avoid a flash of
 * content during the SecureStore read on cold launch.
 */
export function LockScreenOverlay() {
  const { status, unlock } = useLock();
  const { tokens } = useTheme();

  // Auto-prompt biometric on first enter into "locked" — saves the
  // user a tap. If they cancel the OS dialog, they can re-trigger
  // via the on-screen button.
  useEffect(() => {
    if (status === "locked") {
      void unlock();
    }
  }, [status, unlock]);

  if (status === "unlocked") return null;

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
              onPress={() => void unlock()}
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
        </View>
      </SafeAreaView>
    </View>
  );
}
