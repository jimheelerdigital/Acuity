import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { ArrowRight, Bell, Check, CircleCheck } from "lucide-react-native";

import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { isHabitsEnabled } from "@/lib/feature-flags";
import { REFLECTION_HABIT_NAME, addReflectionHabit, createHabit, fetchHabits, isReflectionHabit } from "@/lib/habits-api";
import { trackV10 } from "@/lib/onboarding-v10/analytics";
import { claimAnonymousDebrief } from "@/lib/onboarding-v10/claim";
import { REMINDER_SLOTS, localTimeFor, type ReminderSlot } from "@/lib/onboarding-v10/reminders";
import { uploadDebrief } from "@/lib/onboarding-v10/upload";
import { loadAnswers, saveAnswers } from "@/lib/onboarding-v11/answers";
import { habitSuggestions } from "@/lib/onboarding-v11/copy";
import { trackV11 } from "@/lib/onboarding-v11/flow";
import { registerPushTokenForReminderSlot } from "@/lib/push-token";

import {
  Body,
  Card,
  Checkbox,
  FunnelHeader,
  Heading,
  LightScreen,
  PROGRESS,
  PrimaryButton,
  RippleAppIcon,
  TextButton,
  V11,
} from "../_v11/ui";

/**
 * Miro #11–14 — analyze, and set the account up while it analyzes.
 *
 *   #11 "analyze screen + while we analyze, let's get your account set up"
 *   #12 notification permission, smart notifications (analyze in bkgrnd)
 *   #13 "want to add your first habit to track?" add or skip (2–3 pre-filled)
 *   #14 results "open it as soon as the analysis finishes, with a 'Your
 *       results are ready →' button if they're mid-step"
 *
 * The upload/claim runs from mount; the setup steps run on top of it.
 * If the analysis lands while she's mid-step → a "Your results are ready →"
 * button appears; if she's done with the steps → the results open on
 * their own the moment it lands.
 *
 * ── Real stages, no fake progress (unchanged from v10) ───────────────
 * The analyzing card names the stage the work is actually in, never a
 * percentage. Stage 1 = upload in flight; stage 2 = attaching to her
 * account (the claim creates every extracted task); done = ready.
 *
 * ── Retry without re-recording (unchanged) ───────────────────────────
 * The audio URI is a route param, so a failed upload retries the SAME
 * file. `typed=1` (typed debrief, already extracted) skips the upload.
 */

const STAGES = ["Listening back to what you said", "Pulling out your to-dos and habits", "Putting it on your list"] as const;

type Phase = "notify" | "habit" | "waiting";

export default function V10Processing() {
  const params = useLocalSearchParams<{ uri?: string; typed?: string }>();
  const uri = typeof params.uri === "string" ? params.uri : null;
  const typed = params.typed === "1";

  const [stage, setStage] = useState(0);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<{ message: string; retryable: boolean; rerecord?: boolean } | null>(null);
  const [phase, setPhase] = useState<Phase>("notify");
  const startedAtRef = useRef(Date.now());
  const attemptRef = useRef(0);
  const leftRef = useRef(false);

  const run = useCallback(async () => {
    setFailed(null);
    setReady(false);
    setStage(0);
    startedAtRef.current = Date.now();
    attemptRef.current += 1;

    if (!typed) {
      if (!uri) {
        setFailed({ message: "That debrief didn't reach Ripple. Please record again.", retryable: false, rerecord: true });
        return;
      }
      const result = await uploadDebrief(uri);
      if (!result.ok) {
        trackV10("v10_processing_failed", {
          rerecord: !!result.rerecord,
          retryable: result.retryable,
          detail: result.detail ?? null,
          attempt: attemptRef.current,
        });
        setFailed({
          message: result.error ?? "Ripple couldn't finish that one. Your recording is safe. Try again.",
          retryable: result.retryable,
          rerecord: result.rerecord,
        });
        return;
      }
    }

    // Signed in by now (account first): attach the debrief to her account
    // right away so it never sits on an anonymous token that expires. The
    // claim creates every extracted task, so the results can show the REAL
    // to-dos. Max 6s; on a timeout the results fall back to the extraction
    // and finishOnboarding() retries the claim.
    setStage(1);
    const claim = await Promise.race([
      claimAnonymousDebrief().catch(() => null),
      new Promise<null>((r) => setTimeout(() => r(null), 6000)),
    ]);
    setEntryId(claim && claim.status === "claimed" && claim.entryId ? claim.entryId : null);
    setStage(2);
    trackV10("v10_processing_latency", { ms: Date.now() - startedAtRef.current, attempt: attemptRef.current, typed });
    setReady(true);
  }, [uri, typed]);

  useEffect(() => {
    trackV10("v10_processing_viewed", { flow: "v11" });
    void run();
  }, [run]);

  const openResults = useCallback(
    (how: "auto" | "button") => {
      if (leftRef.current) return;
      leftRef.current = true;
      trackV11("processing", "answered", how === "auto" ? "results_auto" : "results_button");
      router.replace(entryId ? { pathname: "/onboarding-new/reveal", params: { entryId } } : "/onboarding-new/reveal");
    },
    [entryId]
  );

  // Done with the setup steps → open the results the moment they land.
  useEffect(() => {
    if (ready && phase === "waiting") openResults("auto");
  }, [ready, phase, openResults]);

  const afterNotify = () => setPhase(isHabitsEnabled() ? "habit" : "waiting");

  return (
    <LightScreen>
      <FunnelHeader progress={PROGRESS.processing} />
      {failed ? (
        <FailedState failed={failed} onRetry={() => void run()} />
      ) : (
        <View style={{ flex: 1 }}>
          <AnalyzingCard stage={stage} ready={ready} onOpen={() => openResults("button")} />
          {phase === "notify" ? <NotifyStep onDone={afterNotify} /> : null}
          {phase === "habit" ? <HabitStep onDone={() => setPhase("waiting")} /> : null}
          {phase === "waiting" ? <WaitingState /> : null}
        </View>
      )}
    </LightScreen>
  );
}

// ── Analyzing / ready card (top of the screen, always visible) ───────────

function AnalyzingCard({ stage, ready, onOpen }: { stage: number; ready: boolean; onOpen: () => void }) {
  if (ready) {
    return (
      <Animated.View entering={FadeIn.duration(260)} style={{ paddingHorizontal: 20, paddingTop: 6 }}>
        <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel="Your results are ready. Open them">
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderColor: V11.coral, borderWidth: 1.5 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: V11.good, alignItems: "center", justifyContent: "center" }}>
              <Check size={22} color="#ffffff" strokeWidth={3} />
            </View>
            <Text style={{ flex: 1, fontFamily: V11.display, fontSize: 17, color: V11.ink }}>Your results are ready</Text>
            <ArrowRight size={22} color={V11.coral} strokeWidth={2.4} />
          </Card>
        </Pressable>
      </Animated.View>
    );
  }
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 6 }}>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 12 }}>
        <Pulse>
          <RippleAppIcon size={40} />
        </Pulse>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: V11.display, fontSize: 16, color: V11.ink }}>Analyzing your debrief</Text>
          <Text style={{ marginTop: 2, fontSize: 13, color: V11.ter }}>{STAGES[Math.min(stage, STAGES.length - 1)]}…</Text>
        </View>
      </Card>
    </View>
  );
}

function Pulse({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
      <Ring delay={0} />
      <Ring delay={900} />
      {children}
    </View>
  );
}

function Ring({ delay }: { delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false));
  }, [delay, t]);
  const s = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - t.value), transform: [{ scale: 1 + t.value * 0.7 }] }));
  return (
    <Animated.View
      style={[{ position: "absolute", width: 40, height: 40, borderRadius: 12, borderWidth: 2, borderColor: V11.coral }, s]}
    />
  );
}

// ── #12 Notifications ────────────────────────────────────────────────────

const PREVIEW: Record<Exclude<ReminderSlot, "none">, { title: string; body: string }> = {
  morning: { title: "Morning check-in", body: "What's on your mind before the day starts?" },
  midday: { title: "Quick check-in", body: "What's surfacing right now?" },
  after_work: { title: "Wind down", body: "How did today actually go?" },
  late: { title: "Wind down", body: "How did today actually go?" },
};

function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function NotifyStep({ onDone }: { onDone: () => void }) {
  const [selected, setSelected] = useState<Exclude<ReminderSlot, "none">>("late");
  const [busy, setBusy] = useState(false);
  const slots = REMINDER_SLOTS.filter((s) => s.key !== "none") as {
    key: Exclude<ReminderSlot, "none">;
    label: string;
    localTime: string | null;
  }[];

  useEffect(() => {
    trackV10("v10_reminder_viewed", { flow: "v11" });
  }, []);

  const save = async (slot: ReminderSlot) => {
    if (busy) return;
    setBusy(true);
    try {
      trackV10("v10_reminder_selected", { slot, flow: "v11" });
      // Persist BEFORE the OS prompt, through the reminders API the
      // scheduler already reads (same as v10 Screen 8 / the welcome flow).
      const time = localTimeFor(slot);
      await saveAnswers({ checkInTime: time });
      await api
        .put("/api/account/reminders", {
          reminders: time ? [{ time, daysActive: [0, 1, 2, 3, 4, 5, 6], enabled: true }] : [],
        })
        .catch(() => {});
      // iOS gives ONE chance at the permission prompt — never spend it on
      // someone who just said no to reminders.
      if (slot !== "none") {
        const result = await registerPushTokenForReminderSlot();
        trackV10("v10_os_push_prompt", { result, flow: "v11" });
      }
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const preview = PREVIEW[selected];

  return (
    <Body
      footer={
        <>
          <PrimaryButton label="Turn on reminders" busy={busy} onPress={() => void save(selected)} />
          <TextButton label="No reminders for now" onPress={() => void save("none")} />
        </>
      }
    >
      <Heading
        eyebrow="While Ripple listens back"
        title="When should Ripple check in?"
        sub="One nudge a day, at a time that suits you. No guilt, no streaks."
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 }}>
        {slots.map((s, i) => {
          const on = selected === s.key;
          return (
            <Animated.View key={s.key} entering={FadeInDown.delay(60 + i * 50).duration(340)} style={{ width: "48.5%" }}>
              <Pressable onPress={() => setSelected(s.key)} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                <Card selected={on} style={{ padding: 16 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: on ? V11.coral : V11.sec }}>{s.label}</Text>
                  <Text style={{ marginTop: 4, fontFamily: V11.heading, fontSize: 24, letterSpacing: -0.4, color: V11.ink }}>
                    {clock(s.localTime ?? "")}
                  </Text>
                </Card>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
      <Text style={{ marginTop: 22, fontSize: 12, fontWeight: "800", letterSpacing: 0.8, color: V11.ter }}>WHAT IT LOOKS LIKE</Text>
      <Card style={{ marginTop: 8, flexDirection: "row", gap: 12, padding: 14, borderRadius: 20 }}>
        <RippleAppIcon size={38} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: V11.ink }}>{preview.title}</Text>
            <Text style={{ fontSize: 13, color: V11.ter }}>{clock(localTimeFor(selected) ?? "21:00")}</Text>
          </View>
          <Text style={{ marginTop: 2, fontSize: 14, lineHeight: 19, color: V11.sec }}>{preview.body}</Text>
        </View>
      </Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 }}>
        <Bell size={15} color={V11.ter} />
        <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: V11.ter }}>
          Change the time, add more, or turn them off any time in Settings.
        </Text>
      </View>
    </Body>
  );
}

// ── #13 First habit ──────────────────────────────────────────────────────

function HabitStep({ onDone }: { onDone: () => void }) {
  const [options, setOptions] = useState<string[]>([REFLECTION_HABIT_NAME]);
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    trackV11("habit", "viewed");
    void loadAnswers().then((a) => {
      // Ripple's own reflection habit first, then two picked from what
      // she said she's carrying (Miro: "pre-fill 2–3 habit suggestions").
      const picks = habitSuggestions(a.carrying).filter((h) => h !== REFLECTION_HABIT_NAME).slice(0, 2);
      const opts = [REFLECTION_HABIT_NAME, ...picks];
      setOptions(opts);
      setSelected([opts[0]]);
    });
  }, []);

  const toggle = (name: string) =>
    setSelected((cur) => (cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name]));

  const addOwn = () => {
    const name = draft.trim().slice(0, 80);
    if (!name) return;
    if (!options.some((o) => o.toLowerCase() === name.toLowerCase())) setOptions((cur) => [...cur, name]);
    setSelected((cur) => (cur.some((x) => x.toLowerCase() === name.toLowerCase()) ? cur : [...cur, name]));
    setDraft("");
  };

  const onAdd = async () => {
    if (!selected.length || busy) return;
    setBusy(true);
    try {
      // Skip any she already has (a repeated visit must not duplicate).
      const existing = await fetchHabits().catch(() => ({ habits: [], checks: [] }));
      const have = new Set(existing.habits.map((h) => h.name.trim().toLowerCase()));
      const hasReflection = existing.habits.some((h) => isReflectionHabit(h));
      for (const name of options.filter((o) => selected.includes(o))) {
        if (name === REFLECTION_HABIT_NAME) {
          if (!hasReflection) await addReflectionHabit().catch(() => null);
        } else if (!have.has(name.trim().toLowerCase())) {
          await createHabit(name).catch(() => null);
        }
      }
      trackV11("habit", "answered", selected.join(" | ").slice(0, 200));
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const n = selected.length;
  return (
    <Body
      footer={
        <>
          <PrimaryButton
            label={n ? `Track ${n === 1 ? "this habit" : `${n} habits`}` : "Pick one, or skip"}
            disabled={!n}
            busy={busy}
            onPress={() => void onAdd()}
          />
          <TextButton
            label="Skip for now"
            onPress={() => {
              trackV11("habit", "answered", "skipped");
              onDone();
            }}
          />
        </>
      }
    >
      <Heading
        eyebrow="Almost there"
        title="Want to add your first habit to track?"
        sub="Mention it in a debrief and Ripple checks it off for you."
      />
      <Card style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <Pressable
              key={o}
              onPress={() => toggle(o)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingVertical: 15,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: V11.lineStrong,
              }}
            >
              <Checkbox on={on} />
              <Text style={{ flex: 1, fontSize: 17, fontWeight: on ? "700" : "500", color: V11.ink }}>{o}</Text>
            </Pressable>
          );
        })}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Add your own"
            placeholderTextColor={V11.quiet}
            maxLength={80}
            returnKeyType="done"
            onSubmitEditing={addOwn}
            style={{ flex: 1, fontSize: 17, color: V11.ink, paddingVertical: 8 }}
          />
          <Pressable
            onPress={addOwn}
            accessibilityRole="button"
            accessibilityLabel="Add habit"
            style={{
              height: 36,
              paddingHorizontal: 16,
              borderRadius: 18,
              backgroundColor: draft.trim() ? V11.coral : V11.coralSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "700", color: draft.trim() ? "#ffffff" : V11.coral }}>Add</Text>
          </Pressable>
        </View>
      </Card>
    </Body>
  );
}

// ── Done with setup, analysis still running ──────────────────────────────

function WaitingState() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
      <Animated.View entering={FadeIn.duration(300)} style={{ alignItems: "center" }}>
        <CircleCheck size={40} color={V11.good} />
        <Text style={{ marginTop: 14, textAlign: "center", fontFamily: V11.heading, fontSize: 24, letterSpacing: -0.5, color: V11.ink }}>
          You're all set up
        </Text>
        <Text style={{ marginTop: 8, textAlign: "center", fontSize: 16, lineHeight: 23, color: V11.sec }}>
          Ripple is finishing your results. They open the moment they're ready.
        </Text>
      </Animated.View>
    </View>
  );
}

function FailedState({
  failed,
  onRetry,
}: {
  failed: { message: string; retryable: boolean; rerecord?: boolean };
  onRetry: () => void;
}) {
  return (
    <Body
      center
      footer={
        <>
          {failed.retryable ? <PrimaryButton label="Try again" onPress={onRetry} /> : null}
          {failed.rerecord ? (
            <PrimaryButton label="Record again" icon="none" onPress={() => router.replace("/onboarding-new/record")} />
          ) : null}
          {!failed.retryable && !failed.rerecord ? (
            <TextButton label="Back" onPress={() => router.back()} />
          ) : null}
        </>
      }
    >
      <Heading title="That one didn't go through" sub={failed.message} />
    </Body>
  );
}
