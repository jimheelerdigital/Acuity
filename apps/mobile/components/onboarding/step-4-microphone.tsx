import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Platform, Pressable, Text, View } from "react-native";

import { useOnboarding } from "./context";

/**
 * Step 4 — Microphone permission. Requests OS-level mic access using
 * expo-av (already in the mobile bundle for the existing recording
 * flow). State machine: unknown → pending → granted / denied.
 *
 * Apple Guideline 5.1.1(iv) compliance (build-40 rejection): the
 * primary CTA must say "Continue" (not "Grant access") and there must
 * be no Skip escape hatch. The shell's footer "Continue" is gated on
 * status !== "unknown" — meaning the user MUST tap the in-step
 * Continue (which triggers the OS permission prompt) before
 * advancing. Whether they grant or deny inside the OS dialog is up
 * to them; what matters to Apple is that the OS prompt is reached.
 *
 * Step 4 was also removed from the shell's DEFAULT_SKIPPABLE so no
 * footer Skip button appears here.
 */

type Status = "unknown" | "pending" | "granted" | "denied";

export function Step4Microphone() {
  const { setCanContinue, setCapturedData } = useOnboarding();
  const [status, setStatus] = useState<Status>("unknown");

  // Re-query on mount — if the user already granted during a prior
  // session (or from the Settings app), reflect that immediately.
  useEffect(() => {
    Audio.getPermissionsAsync()
      .then((r) => {
        if (r.status === "granted") setStatus("granted");
        else if (r.status === "denied") setStatus("denied");
      })
      .catch(() => {
        // No-op — stays "unknown" and the user can still tap Continue.
      });
  }, []);

  useEffect(() => {
    // Apple 5.1.1(iv): user MUST encounter the OS prompt. Block the
    // shell footer's Continue until they've either granted or denied
    // (both states confirm the OS dialog was shown). "Pending" is
    // mid-flight; "unknown" means the prompt was never triggered.
    setCanContinue(status === "granted" || status === "denied");
    setCapturedData({ microphoneGranted: status === "granted" });
  }, [status, setCanContinue, setCapturedData]);

  const request = useCallback(async () => {
    setStatus("pending");
    try {
      const res = await Audio.requestPermissionsAsync();
      setStatus(res.status === "granted" ? "granted" : "denied");
    } catch {
      setStatus("denied");
    }
  }, []);

  const openSettings = () => {
    if (Platform.OS === "ios") {
      Linking.openURL("app-settings:").catch(() =>
        Alert.alert(
          "Open Settings",
          "In Settings, find Acuity and enable Microphone access."
        )
      );
    } else {
      Linking.openSettings().catch(() => {
        // fallthrough
      });
    }
  };

  return (
    <View className="flex-1">
      <Text className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Mic access
      </Text>
      <Text className="mt-3 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        We record what you say locally, transcribe it, and then delete
        the audio. No background listening. You can revoke this in
        iOS Settings anytime.
      </Text>

      <View className="mt-10 items-center">
        <View
          className="h-24 w-24 items-center justify-center rounded-full"
          style={{
            backgroundColor:
              status === "granted"
                ? "#10B98120"
                : status === "denied"
                  ? "#EF444420"
                  : "#7C3AED20",
          }}
        >
          <Ionicons
            name={
              status === "granted"
                ? "checkmark"
                : status === "denied"
                  ? "close"
                  : "mic-outline"
            }
            size={48}
            color={
              status === "granted"
                ? "#10B981"
                : status === "denied"
                  ? "#EF4444"
                  : "#7C3AED"
            }
          />
        </View>

        <Text className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          {status === "granted"
            ? "Granted."
            : status === "denied"
              ? "Denied — enable in Settings to record."
              : status === "pending"
                ? "Waiting for permission…"
                : "Not asked yet."}
        </Text>

        <View className="mt-6 flex-row gap-3">
          {status !== "granted" && (
            <Pressable
              onPress={request}
              className="rounded-full bg-violet-600 px-4 py-2.5"
            >
              <Text className="text-sm font-semibold text-white">
                {status === "denied" ? "Try again" : "Continue"}
              </Text>
            </Pressable>
          )}
          {status === "denied" && (
            <Pressable
              onPress={openSettings}
              className="rounded-full border border-zinc-200 dark:border-white/10 px-4 py-2.5"
            >
              <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Open Settings
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
