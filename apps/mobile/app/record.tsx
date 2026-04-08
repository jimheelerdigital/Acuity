import { Audio } from "expo-av";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  View,
} from "react-native";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const MAX_SECONDS = 600;

type State = "idle" | "recording" | "processing" | "done";

export default function RecordScreen() {
  const router = useRouter();
  const [recordState, setRecordState] = useState<State>("idle");
  const [elapsed, setElapsed] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Request permission on mount
  useEffect(() => {
    Audio.requestPermissionsAsync();
    Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
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

    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    await recording.startAsync();
    recordingRef.current = recording;
    setElapsed(0);
    setRecordState("recording");

    timerRef.current = setInterval(() => {
      setElapsed((s) => {
        if (s + 1 >= MAX_SECONDS) stopRecording();
        return s + 1;
      });
    }, 1000);
  };

  const stopRecording = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const recording = recordingRef.current;
    if (!recording) return;

    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    recordingRef.current = null;

    if (!uri) {
      Alert.alert("Error", "No audio recorded.");
      setRecordState("idle");
      return;
    }

    await uploadRecording(uri, elapsed);
  };

  const uploadRecording = async (uri: string, duration: number) => {
    setRecordState("processing");

    const formData = new FormData();
    // React Native FormData accepts { uri, name, type }
    formData.append("audio", {
      uri,
      name: "recording.m4a",
      type: "audio/m4a",
    } as unknown as Blob);
    formData.append("durationSeconds", String(duration));

    try {
      const res = await fetch(`${API_URL}/api/record`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      setRecordState("done");
      setTimeout(() => router.replace("/"), 1500);
    } catch (err) {
      Alert.alert(
        "Upload failed",
        err instanceof Error ? err.message : "Please try again."
      );
      setRecordState("idle");
    }
  };

  const handlePress = () => {
    if (recordState === "recording") {
      stopRecording();
    } else if (recordState === "idle") {
      startRecording();
    }
  };

  return (
    <View className="flex-1 bg-zinc-950 items-center justify-center px-8">
      {recordState === "processing" ? (
        <View className="items-center gap-4">
          <ActivityIndicator size="large" color="#7C3AED" />
          <Text className="text-zinc-400 text-sm">
            Transcribing and extracting…
          </Text>
        </View>
      ) : recordState === "done" ? (
        <View className="items-center gap-3">
          <Text className="text-4xl">✅</Text>
          <Text className="text-zinc-100 font-semibold text-lg">Done!</Text>
          <Text className="text-zinc-400 text-sm">Redirecting…</Text>
        </View>
      ) : (
        <View className="items-center gap-8">
          <View className="items-center gap-2">
            <Text className="text-zinc-100 text-xl font-semibold">
              {recordState === "recording" ? "Recording…" : "Ready"}
            </Text>
            {recordState === "recording" && (
              <Text className="text-zinc-400 text-2xl font-mono">
                {formatTime(elapsed)}
              </Text>
            )}
          </View>

          {/* Record button */}
          <Pressable
            onPress={handlePress}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              transform: [{ scale: pressed ? 0.95 : 1 }],
            })}
          >
            <View
              className={`h-24 w-24 rounded-full items-center justify-center ${
                recordState === "recording" ? "bg-red-600" : "bg-violet-600"
              }`}
            >
              {recordState === "recording" ? (
                <View className="h-8 w-8 rounded bg-white" />
              ) : (
                <Text className="text-4xl">🎙️</Text>
              )}
            </View>
          </Pressable>

          <Text className="text-zinc-500 text-sm text-center">
            {recordState === "recording"
              ? "Tap to stop"
              : "Tap to start your brain dump"}
          </Text>
        </View>
      )}
    </View>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
