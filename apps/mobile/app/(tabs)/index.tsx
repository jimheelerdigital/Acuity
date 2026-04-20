import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as Linking from "expo-linking";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  MOOD_EMOJI,
  MOOD_LABELS,
  PRIORITY_COLOR,
  type ExtractionResult,
} from "@acuity/shared";

import {
  useEntryPolling,
  type PolledEntry,
} from "@/hooks/use-entry-polling";

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const MAX_SECONDS = 120;

type RecordState =
  | "idle"
  | "recording"
  | "uploading"
  | "processing" // async: Inngest pipeline
  | "done"
  | "timeout";

type Result = {
  entryId: string;
  extraction: ExtractionResult;
  tasksCreated: number;
  partial?: boolean;
};

const STEPPER_PHASES: { key: string; label: string }[] = [
  { key: "QUEUED", label: "Saving your recording" },
  { key: "TRANSCRIBING", label: "Transcribing" },
  { key: "EXTRACTING", label: "Extracting insights" },
  { key: "PERSISTING", label: "Almost done" },
];

export default function RecordTab() {
  const [state, setState] = useState<RecordState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [polledEntryId, setPolledEntryId] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const poll = useEntryPolling(polledEntryId);

  // Bridge polling terminal states into the main RecordState.
  useEffect(() => {
    if (!polledEntryId) return;
    if (poll.status === "complete" && poll.entry) {
      setResult(polledEntryToResult(poll.entry, false));
      setState("done");
    } else if (poll.status === "partial" && poll.entry) {
      setResult(polledEntryToResult(poll.entry, true));
      setState("done");
    } else if (poll.status === "failed") {
      Alert.alert(
        "Processing failed",
        poll.entry?.errorMessage ?? "We couldn't process your recording."
      );
      setState("idle");
      setPolledEntryId(null);
    } else if (poll.status === "timeout") {
      setState("timeout");
    }
  }, [poll.status, poll.entry, polledEntryId]);

  // Pulse animation
  useEffect(() => {
    if (state === "idle") {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [state, pulseAnim]);

  // Mic permission
  useEffect(() => {
    Audio.requestPermissionsAsync();
    Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
  }, []);

  // Clean up on unmount — extra belt-and-suspenders for Expo's tab
  // switches, which don't always unmount but do suspend state updates.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  const startRecording = async () => {
    const { granted } = await Audio.getPermissionsAsync();
    if (!granted) {
      Alert.alert(
        "Microphone access required",
        "Go to Settings > Acuity > Microphone to enable access."
      );
      return;
    }

    setResult(null);
    setPolledEntryId(null);
    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    await recording.startAsync();
    recordingRef.current = recording;
    setElapsed(0);
    setState("recording");

    timerRef.current = setInterval(() => {
      setElapsed((s) => {
        if (s + 1 >= MAX_SECONDS) {
          stopRecording();
        }
        return s + 1;
      });
    }, 1000);
  };

  const stopRecording = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const recording = recordingRef.current;
    if (!recording) return;

    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    recordingRef.current = null;

    if (!uri) {
      Alert.alert("Error", "No audio recorded.");
      setState("idle");
      return;
    }

    await uploadRecording(uri, elapsed);
  };

  const uploadRecording = async (uri: string, duration: number) => {
    setState("uploading");

    const formData = new FormData();
    formData.append("audio", {
      uri,
      name: "recording.m4a",
      type: "audio/m4a",
    } as unknown as Blob);
    formData.append("durationSeconds", String(duration));

    try {
      const res = await fetch(`${BASE_URL}/api/record`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      // Paywall rejection — trial expired or post-trial-free. Open
      // web /upgrade in the system browser (IAP not implemented; per
      // 2026-04-18 decision the mobile flow uses the web checkout
      // until IAP lands).
      if (res.status === 402) {
        Alert.alert(
          "Your trial has ended",
          "Month 2 is where the pattern deepens. Continue the journey?",
          [
            { text: "Not now", style: "cancel", onPress: () => setState("idle") },
            {
              text: "Continue",
              onPress: () => {
                Linking.openURL(`${BASE_URL}/upgrade?src=mobile_profile`);
                setState("idle");
              },
            },
          ]
        );
        return;
      }

      // Rate-limited.
      if (res.status === 429) {
        const body = await res.json().catch(() => ({ retryAfter: 60 }));
        const retry = Number((body as { retryAfter?: number }).retryAfter ?? 60);
        Alert.alert(
          "Recording too frequently",
          `Try again in ${Math.ceil(retry / 60)} minute${retry > 60 ? "s" : ""}.`
        );
        setState("idle");
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `HTTP ${res.status}`
        );
      }

      const body = (await res.json()) as {
        entryId: string;
        status?: string;
        extraction?: ExtractionResult;
        tasksCreated?: number;
      };

      // Async path: 202 → start polling.
      if (res.status === 202 && body.entryId) {
        setState("processing");
        setPolledEntryId(body.entryId);
        return;
      }

      // Sync path: 201 with inline RecordResponse.
      if (body.extraction) {
        setResult({
          entryId: body.entryId,
          extraction: body.extraction,
          tasksCreated: body.tasksCreated ?? 0,
        });
        setState("done");
        return;
      }

      throw new Error("Unexpected response shape");
    } catch (err) {
      Alert.alert(
        "Upload failed",
        err instanceof Error ? err.message : "Please try again."
      );
      setState("idle");
    }
  };

  const handlePress = () => {
    if (state === "recording") {
      stopRecording();
    } else if (state === "idle" || state === "done" || state === "timeout") {
      setState("idle");
      setResult(null);
      setPolledEntryId(null);
      startRecording();
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-zinc-950" edges={["top"]}>
      {state === "done" && result ? (
        <ResultCard result={result} onNewRecording={handlePress} />
      ) : state === "processing" ? (
        <ProcessingView
          currentPhase={poll.phase}
          elapsedSeconds={poll.elapsedSeconds}
        />
      ) : (
        <View className="flex-1 items-center justify-center px-8">
          {state === "uploading" ? (
            <View className="items-center gap-4">
              <ActivityIndicator size="large" color="#7C3AED" />
              <Text className="text-zinc-400 text-sm">Uploading audio...</Text>
            </View>
          ) : state === "timeout" ? (
            <View className="items-center gap-4">
              <Text className="text-zinc-100 text-lg font-semibold text-center">
                Still processing — we&rsquo;ll save your progress.
              </Text>
              <Text className="text-zinc-500 text-sm text-center">
                Check back from your dashboard in a few minutes.
              </Text>
              <Pressable
                onPress={handlePress}
                className="mt-4 rounded-2xl bg-violet-600 py-3 px-6"
              >
                <Text className="text-sm font-semibold text-white">
                  Record another
                </Text>
              </Pressable>
            </View>
          ) : (
            <View className="items-center gap-8">
              <View className="items-center gap-2">
                <Text className="text-zinc-100 text-xl font-semibold">
                  {state === "recording" ? "Recording..." : "Ready to record"}
                </Text>
                {state === "recording" ? (
                  <Text className="text-zinc-400 text-3xl font-mono">
                    {formatTime(elapsed)}
                  </Text>
                ) : (
                  <Text className="text-zinc-500 text-sm">Up to 2 minutes</Text>
                )}
              </View>

              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <Pressable
                  onPress={handlePress}
                  style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                >
                  <View
                    className={`h-32 w-32 rounded-full items-center justify-center ${
                      state === "recording" ? "bg-red-600" : "bg-violet-600"
                    }`}
                    style={
                      state === "idle"
                        ? {
                            shadowColor: "#7C3AED",
                            shadowOffset: { width: 0, height: 0 },
                            shadowOpacity: 0.5,
                            shadowRadius: 24,
                            elevation: 12,
                          }
                        : undefined
                    }
                  >
                    {state === "recording" ? (
                      <View className="h-10 w-10 rounded bg-white" />
                    ) : (
                      <Ionicons name="mic" size={48} color="#fff" />
                    )}
                  </View>
                </Pressable>
              </Animated.View>

              <Text className="text-zinc-500 text-sm text-center">
                {state === "recording" ? "Tap to stop" : "Tap to start your brain dump"}
              </Text>

              {state === "recording" && (
                <View className="w-48 h-1 rounded-full bg-zinc-800">
                  <View
                    className="h-1 rounded-full bg-red-500"
                    style={{ width: `${(elapsed / MAX_SECONDS) * 100}%` }}
                  />
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

function ProcessingView({
  currentPhase,
  elapsedSeconds,
}: {
  currentPhase: string | null;
  elapsedSeconds: number;
}) {
  const currentIndex = Math.max(
    0,
    STEPPER_PHASES.findIndex((p) => p.key === currentPhase)
  );
  return (
    <View className="flex-1 items-center justify-center px-8">
      <ActivityIndicator size="large" color="#7C3AED" />
      <Text className="mt-4 text-zinc-400 text-sm">
        {STEPPER_PHASES[currentIndex]?.label ?? "Processing"}
      </Text>
      <Text className="mt-2 text-zinc-600 text-xs">
        {elapsedSeconds}s elapsed
      </Text>
    </View>
  );
}

function polledEntryToResult(entry: PolledEntry, partial: boolean): Result {
  const raw = (entry.rawAnalysis ?? {}) as Partial<ExtractionResult>;
  const extraction: ExtractionResult = {
    summary: entry.summary ?? raw.summary ?? "",
    mood: (entry.mood as ExtractionResult["mood"]) ?? raw.mood ?? "NEUTRAL",
    moodScore: entry.moodScore ?? raw.moodScore ?? 5,
    energy: entry.energy ?? raw.energy ?? 5,
    themes: entry.themes ?? raw.themes ?? [],
    wins: entry.wins ?? raw.wins ?? [],
    blockers: entry.blockers ?? raw.blockers ?? [],
    insights: raw.insights ?? [],
    tasks: raw.tasks ?? [],
    goals: raw.goals ?? [],
    lifeAreaMentions: raw.lifeAreaMentions,
  };
  return {
    entryId: entry.id,
    extraction,
    tasksCreated: extraction.tasks.length,
    partial,
  };
}

function ResultCard({
  result,
  onNewRecording,
}: {
  result: Result;
  onNewRecording: () => void;
}) {
  const { extraction } = result;
  const moodEmoji = MOOD_EMOJI[extraction.mood] ?? "";
  const moodLabel = MOOD_LABELS[extraction.mood] ?? extraction.mood;

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
    >
      <View className="items-center mb-6">
        <Text className="text-4xl mb-2">{result.partial ? "⚠️" : "✅"}</Text>
        <Text className="text-xl font-bold text-zinc-50">
          {result.partial ? "Saved (Partial)" : "Session Complete"}
        </Text>
      </View>

      {result.partial && (
        <View className="rounded-2xl border border-amber-700/50 bg-amber-900/20 p-3 mb-4">
          <Text className="text-xs text-amber-200">
            Your entry is saved, but Life Matrix updates will catch up shortly.
          </Text>
        </View>
      )}

      <View className="flex-row justify-center gap-6 mb-6">
        <View className="items-center">
          <Text className="text-3xl">{moodEmoji}</Text>
          <Text className="text-xs text-zinc-400 mt-1">{moodLabel}</Text>
        </View>
        <View className="items-center">
          <Text className="text-3xl text-zinc-100">{extraction.moodScore}</Text>
          <Text className="text-xs text-zinc-400 mt-1">Mood Score</Text>
        </View>
        <View className="items-center">
          <Text className="text-3xl text-zinc-100">{extraction.energy}</Text>
          <Text className="text-xs text-zinc-400 mt-1">Energy</Text>
        </View>
      </View>

      <View className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 mb-4">
        <Text className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
          Summary
        </Text>
        <Text className="text-sm text-zinc-200 leading-relaxed">
          {extraction.summary}
        </Text>
      </View>

      {extraction.themes.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5 mb-4">
          {extraction.themes.map((t) => (
            <View key={t} className="rounded-full bg-zinc-800 px-3 py-1">
              <Text className="text-xs text-zinc-400">{t}</Text>
            </View>
          ))}
        </View>
      )}

      {extraction.tasks.length > 0 && (
        <View className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 mb-4">
          <Text className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Extracted Tasks ({extraction.tasks.length})
          </Text>
          {extraction.tasks.map((task, i) => (
            <View
              key={i}
              className={`flex-row items-start gap-2.5 ${
                i > 0 ? "mt-2.5 pt-2.5 border-t border-zinc-800" : ""
              }`}
            >
              <View
                className="mt-1 h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: PRIORITY_COLOR[task.priority] ?? "#71717A",
                }}
              />
              <View className="flex-1">
                <Text className="text-sm text-zinc-200">{task.title}</Text>
                <Text className="text-xs text-zinc-500 mt-0.5">
                  {task.priority}
                  {task.dueDate ? ` · Due ${task.dueDate}` : ""}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {extraction.insights.length > 0 && (
        <View className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 mb-6">
          <Text className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-3">
            Insights
          </Text>
          {extraction.insights.map((insight, i) => (
            <View key={i} className={`flex-row gap-2 ${i > 0 ? "mt-2" : ""}`}>
              <Text className="text-violet-400 text-sm">-</Text>
              <Text className="text-sm text-zinc-300 flex-1">{insight}</Text>
            </View>
          ))}
        </View>
      )}

      <Pressable
        onPress={onNewRecording}
        className="rounded-2xl bg-violet-600 py-4 items-center"
        style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
      >
        <Text className="text-sm font-semibold text-white">Record Another</Text>
      </Pressable>
    </ScrollView>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
