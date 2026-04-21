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
 * Continue is always enabled — Acuity's dashboard nudges users to
 * grant later if they skip here, and the spec specifically says mic is
 * a soft step. A denied state shows a "Open Settings" link so users
 * can self-service the recovery path.
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
        // No-op — stays "unknown" and the user can still tap Grant.
      });
  }, []);

  useEffect(() => {
    setCanContinue(true);
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
                {status === "denied" ? "Try again" : "Grant access"}
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
