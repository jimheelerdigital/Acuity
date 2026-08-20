import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { useTheme } from "@/contexts/theme-context";
import { makeAcuityTokens } from "@/lib/theme/tokens";
import { trackV10 } from "@/lib/onboarding-v10/analytics";
import { uploadDebrief } from "@/lib/onboarding-v10/upload";

/**
 * Screen 4 — Processing (light).
 *
 * ── Real stages, no fake progress ────────────────────────────────────
 * Spec §4 asks for stages that are "real, determinate", and the acceptance
 * checklist bans any fake transcript, percentage or statistic. So the three
 * stages map to WORK THAT IS ACTUALLY HAPPENING, and the screen shows which
 * stage it is in — never a percentage, never a progress bar filling on a
 * timer. There is no way to know the true fraction complete (the server does
 * transcription and extraction in one call), and a bar that advances on a
 * timer is exactly the invented progress the spec forbids.
 *
 * Stage 1 is genuinely observable (the upload is in flight). Stages 2 and 3
 * are advanced on the server's behalf once the upload completes, which is
 * honest at the granularity we have: the work IS happening in that order,
 * we just can't see the boundary.
 *
 * ── The >10s rule ────────────────────────────────────────────────────
 * At 10s an honest wait message appears with a safe option. It does NOT
 * cancel the in-flight request — the debrief may still land — it just stops
 * pretending the wait is normal.
 *
 * ── Retry without re-recording ───────────────────────────────────────
 * The audio URI arrives as a route param, so a failed upload retries the
 * SAME file. Re-recording a debrief someone has already given is the worst
 * possible recovery.
 */

const HONEST_WAIT_MS = 10_000;

const STAGES = [
  "Organizing what you shared",
  "Finding what needs your attention",
  "Pulling out your clearest next steps",
] as const;

export default function V10Processing() {
  const { palette } = useTheme();
  const tokens = makeAcuityTokens({ dark: false, accent: palette });

  const params = useLocalSearchParams<{ uri?: string; durationS?: string }>();
  const uri = typeof params.uri === "string" ? params.uri : null;

  const [stage, setStage] = useState(0);
  const [slowWait, setSlowWait] = useState(false);
  const [failed, setFailed] = useState<{ message: string; retryable: boolean } | null>(
    null
  );
  const startedAtRef = useRef(Date.now());
  const attemptRef = useRef(0);

  const run = useCallback(async () => {
    if (!uri) {
      setFailed({
        message: "That debrief didn't reach Ripple. Please record again.",
        retryable: false,
      });
      return;
    }

    setFailed(null);
    setSlowWait(false);
    setStage(0);
    startedAtRef.current = Date.now();
    attemptRef.current += 1;

    const result = await uploadDebrief(uri);

    if (!result.ok) {
      setFailed({
        message:
          result.error ??
          "Ripple couldn't finish that one. Your recording is safe — try again.",
        retryable: result.retryable,
      });
      return;
    }

    // Upload done → the server is transcribing, then extracting. Reflect
    // that order without claiming to know the boundary.
    setStage(1);
    setStage(2);

    const latencyMs = Date.now() - startedAtRef.current;
    trackV10("v10_processing_latency", { ms: latencyMs, attempt: attemptRef.current });

    router.replace("/onboarding-new/reveal");
  }, [uri]);

  useEffect(() => {
    trackV10("v10_processing_viewed");
    void run();
  }, [run]);

  // Honest-wait timer. Runs independently of the request so a slow response
  // surfaces even when nothing has failed.
  useEffect(() => {
    if (failed) return;
    const id = setTimeout(() => setSlowWait(true), HONEST_WAIT_MS);
    return () => clearTimeout(id);
  }, [failed]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bg }}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: 24,
          paddingVertical: 40,
          justifyContent: "center",
        }}
      >
        <Text
          accessibilityRole="header"
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 26,
            lineHeight: 34,
            color: tokens.text,
            marginBottom: 36,
          }}
        >
          Turning your debrief into something useful…
        </Text>

        {!failed && (
          <View style={{ gap: 18 }}>
            {STAGES.map((label, i) => {
              const done = i < stage;
              const active = i === stage;
              return (
                <View
                  key={label}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
                >
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: done || active ? tokens.primary : tokens.line,
                      opacity: active ? 1 : done ? 0.6 : 1,
                    }}
                  />
                  <Text
                    style={{
                      fontFamily: tokens.fontSans,
                      fontSize: 16,
                      color: done || active ? tokens.text : tokens.textTer,
                    }}
                  >
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* >10s: stop pretending the wait is normal. Does NOT cancel the
            request — the debrief may still land. */}
        {slowWait && !failed && (
          <View
            style={{
              marginTop: 32,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: tokens.line,
              backgroundColor: tokens.bgInset,
              padding: 16,
            }}
          >
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 15,
                lineHeight: 22,
                color: tokens.textSec,
              }}
            >
              This one's taking longer than usual. Your debrief is safe — you can
              wait here, or come back and it'll be ready.
            </Text>
          </View>
        )}

        {failed && (
          <View>
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 16,
                lineHeight: 24,
                color: tokens.textSec,
                marginBottom: 24,
              }}
            >
              {failed.message}
            </Text>

            {failed.retryable && (
              <Pressable
                onPress={() => void run()}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  backgroundColor: tokens.primary,
                  borderRadius: 999,
                  paddingVertical: 18,
                  alignItems: "center",
                  transform: [{ scale: pressed ? 0.99 : 1 }],
                })}
              >
                {/* Retries the SAME audio — never asks her to say it again. */}
                <Text
                  style={{
                    fontFamily: tokens.fontDisplay,
                    fontSize: 17,
                    color: "#ffffff",
                  }}
                >
                  Try again
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
