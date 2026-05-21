import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Platform, Pressable, Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";

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
  const { tokens } = useTheme();
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

  const stateColor =
    status === "granted"
      ? tokens.good
      : status === "denied"
        ? tokens.bad
        : tokens.primary;

  return (
    <View className="flex-1">
      <Text
        className="text-3xl font-semibold tracking-tight"
        style={{ color: tokens.text }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        Mic access
      </Text>
      <Text
        className="mt-3 text-base leading-relaxed"
        style={{ color: tokens.textSec }}
      >
        We record what you say locally, transcribe it, and then delete
        the audio. No background listening. You can revoke this in
        iOS Settings anytime.
      </Text>

      <View className="mt-10 items-center">
        <View
          className="h-24 w-24 items-center justify-center rounded-full"
          style={{ backgroundColor: `${stateColor}20` }}
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
            color={stateColor}
          />
        </View>

        <Text
          className="mt-4 text-sm"
          style={{ color: tokens.textSec }}
        >
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
              className="rounded-full px-4 py-2.5"
              style={{ backgroundColor: tokens.primary }}
            >
              <Text
                className="text-sm font-semibold"
                style={{ color: "#FFFFFF" }}
              >
                {status === "denied" ? "Try again" : "Continue"}
              </Text>
            </Pressable>
          )}
          {status === "denied" && (
            <Pressable
              onPress={openSettings}
              className="rounded-full border px-4 py-2.5"
              style={{ borderColor: tokens.line }}
            >
              <Text
                className="text-sm font-medium"
                style={{ color: tokens.textSec }}
              >
                Open Settings
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
