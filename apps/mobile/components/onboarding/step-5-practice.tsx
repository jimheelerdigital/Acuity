import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { useOnboarding } from "./context";

/**
 * Step 5 — Practice recording. A throwaway 30-second sample. The audio
 * is recorded to a temp file and then unloaded without upload — the
 * goal is muscle memory for tap-to-record, not to persist anything.
 *
 * Continue is gated on reaching the "recorded" state (user actually
 * tried the flow). A user who hits Skip from the shell just moves on.
 */

type Phase = "idle" | "recording" | "recorded";
const MAX_SECONDS = 30;

export function Step5Practice() {
  const { setCanContinue, setCapturedData } = useOnboarding();
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);

  const recRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setCanContinue(phase === "recorded" || phase === "idle");
    // No persistence — practice is client-side only.
    setCapturedData(null);
  }, [phase, setCanContinue, setCapturedData]);

  const stop = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      try {
        await rec.stopAndUnloadAsync();
      } catch {
        // swallow — recording might already be stopped
      }
    }
    setPhase("recorded");
  }, []);

  // Clean up any in-flight recording if the user navigates away mid-
  // stream (back button, skip, etc).
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  const start = useCallback(async () => {
    try {
      const perm = await Audio.getPermissionsAsync();
      if (perm.status !== "granted") {
        const req = await Audio.requestPermissionsAsync();
        if (req.status !== "granted") {
          Alert.alert(
            "Microphone needed",
            "Enable microphone access in iOS Settings to try recording."
          );
          return;
        }
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recRef.current = rec;

      const started = Date.now();
      setElapsed(0);
      setPhase("recording");
      timerRef.current = setInterval(() => {
        const s = Math.round((Date.now() - started) / 1000);
        setElapsed(s);
        if (s >= MAX_SECONDS) {
          stop();
        }
      }, 500);
    } catch (err) {
      Alert.alert(
        "Couldn't start",
        err instanceof Error ? err.message : "Try again."
      );
    }
  }, [stop]);

  return (
    <View className="flex-1">
      <Text className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Practice round
      </Text>
      <Text className="mt-3 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        Tap the mic and tell us about your day — what&rsquo;s on your
        mind, what went well, what didn&rsquo;t. Thirty seconds.
        Nothing you say here is saved — it&rsquo;s just to get
        comfortable with the tap-to-record rhythm.
      </Text>

      <View className="mt-12 items-center">
        <Pressable
          onPress={phase === "recording" ? stop : start}
          disabled={phase === "recorded"}
          style={{
            opacity: phase === "recorded" ? 0.7 : 1,
          }}
          className={`h-24 w-24 rounded-full items-center justify-center ${
            phase === "recording"
              ? "bg-red-500"
              : phase === "recorded"
                ? "bg-emerald-500"
                : "bg-violet-600"
          }`}
        >
          <Ionicons
            name={
              phase === "recording"
                ? "stop"
                : phase === "recorded"
                  ? "checkmark"
                  : "mic"
            }
            size={42}
            color="#FFFFFF"
          />
        </Pressable>

        <Text className="mt-5 text-3xl font-mono tabular-nums text-zinc-900 dark:text-zinc-50">
          {String(Math.floor(elapsed / 60)).padStart(2, "0")}:
          {String(elapsed % 60).padStart(2, "0")}
        </Text>
        <Text className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {phase === "idle" && "Tap and start talking"}
          {phase === "recording" &&
            `Listening… ${MAX_SECONDS - elapsed}s left · tap to stop`}
          {phase === "recorded" && "Nice — you're ready."}
        </Text>
      </View>
    </View>
  );
}
