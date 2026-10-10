import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  CoralScreen,
  FunnelCta,
  coralChipStyle,
  coralLabel,
  coralType,
  coralWhiteCard,
} from "@/app/onboarding-new/_v10/_ui";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { useEntryPolling } from "@/hooks/use-entry-polling";
import { TOUR_FORCE_REPLAY_KEY } from "@/hooks/use-tour-trigger";
import { api } from "@/lib/api";
import { ART9_CONSENT_TEXT, ART9_WORDING_VERSION, recordConsent } from "@/lib/consent";
import { isHabitsEnabled } from "@/lib/feature-flags";
import { addReflectionHabit, createHabit } from "@/lib/habits-api";
import { trackOnboardingEvent } from "@/lib/onboarding-events";
import {
  REMINDER_PRIMER,
  REMINDER_SLOTS,
  headlineFor,
  localTimeFor,
  shouldPromptForPush,
  type ReminderSlot,
} from "@/lib/onboarding-v10/reminders";
import { registerPushTokenForReminderSlot } from "@/lib/push-token";
import { makeAcuityTokens, type AcuityTokens } from "@/lib/theme/tokens";
import {
  WELCOME_HABIT_SUGGESTIONS,
  clearWelcome,
  loadWelcome,
  nextPhase,
  progressFor,
  resumePhase,
  saveWelcome,
  type WelcomePhase,
} from "@/lib/welcome/flow";

/**
 * Funnel welcome flow — first run for someone who already paid on the web.
 *
 * Step list and the one deliberate reorder (consent before the recorder)
 * are documented in lib/welcome/flow.ts. Routing into it lives in
 * lib/onboarding-v10/entry-routing.ts; flag EXPO_PUBLIC_FUNNEL_WELCOME.
 *
 * The first debrief is recorded by the REAL recorder (/record?from=welcome),
 * so it becomes a normal journal entry processed by the normal pipeline —
 * not a throwaway practice clip. The recorder stores the entry id via
 * noteWelcomeDebrief() and pops back here; this screen polls that entry
 * while the user sets up reminders and a first habit, then shows results.
 */

type Tokens = AcuityTokens;

export default function WelcomeScreen() {
  const { palette } = useTheme();
  const tokens = useMemo(() => makeAcuityTokens({ dark: false, accent: palette }), [palette]);
  const { user, refresh, setAuthenticatedUser } = useAuth();
  const habitsEnabled = isHabitsEnabled();
  const opts = useMemo(() => ({ habitsEnabled }), [habitsEnabled]);

  const [phase, setPhase] = useState<WelcomePhase | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);

  // (Re)load on every focus: the recorder writes the entry id to storage
  // and pops back, and this is how that hand-off arrives.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void loadWelcome().then((s) => {
        if (cancelled) return;
        setEntryId(s.entryId);
        setPhase(resumePhase(s.phase, s.entryId));
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  useEffect(() => {
    if (phase) void trackOnboardingEvent("v10_welcome_viewed", { value: phase });
  }, [phase]);

  const poll = useEntryPolling(entryId);
  const resultsReady = poll.status === "complete" || poll.status === "partial";

  const go = useCallback(
    (to: WelcomePhase) => {
      setPhase(to);
      void saveWelcome({ phase: to, entryId });
    },
    [entryId]
  );

  const advance = useCallback(() => {
    if (!phase) return;
    const to = nextPhase(phase, opts);
    if (to) go(to);
  }, [phase, opts, go]);

  /**
   * Leave the flow. Same optimistic pattern as the onboarding shell: flip
   * local state first so AuthGate can't bounce them back here, navigate,
   * then write to the server and reconcile.
   */
  const finish = useCallback(
    async ({ skipped }: { skipped: boolean }) => {
      void trackOnboardingEvent(skipped ? "v10_welcome_skipped" : "v10_welcome_completed", {
        value: phase ?? undefined,
      });
      if (user) {
        setAuthenticatedUser({
          ...user,
          onboardingCompleted: true,
          totalRecordings: Math.max(user.totalRecordings ?? 0, entryId ? 1 : 0),
        });
      }
      await clearWelcome();
      if (!skipped) {
        // The auto-tour only fires for zero-recording users; they now have
        // one, so request it explicitly (consumed by useTourTrigger on Home).
        await AsyncStorage.setItem(TOUR_FORCE_REPLAY_KEY, "1").catch(() => {});
      }
      router.replace("/(tabs)");
      void api
        .post("/api/onboarding/complete", skipped ? { skipped: true, skippedAtStep: 1 } : { skipped: false })
        .catch((err) => console.error("[welcome] complete failed:", err))
        .finally(() => {
          void refresh().catch(() => {});
        });
    },
    [phase, user, entryId, setAuthenticatedUser, refresh]
  );

  if (!phase) {
    return (
      <CoralScreen tokens={tokens}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color="#ffffff" />
        </View>
      </CoralScreen>
    );
  }

  const progress = progressFor(phase, opts);
  const banner =
    resultsReady && (phase === "notify" || phase === "habit") ? (
      <ResultsReadyBanner tokens={tokens} onPress={() => go("results")} />
    ) : null;

  return (
    <CoralScreen tokens={tokens}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ProgressBar fraction={progress} />
          {banner}
          {phase === "hello" && (
            <HelloStep
              tokens={tokens}
              name={user?.name ?? null}
              onDone={(name) => {
                if (name && user) {
                  setAuthenticatedUser({ ...user, name });
                  void api.post("/api/user/name", { name }).catch(() => {});
                }
                advance();
              }}
            />
          )}
          {phase === "value" && <ValueStep tokens={tokens} onNext={advance} />}
          {(phase === "consent" || phase === "record") && (
            <ConsentStep
              tokens={tokens}
              alreadyAgreed={phase === "record"}
              onAgreed={() => {
                go("record");
                router.push("/record?from=welcome" as never);
              }}
              onSkip={() => void finish({ skipped: true })}
            />
          )}
          {phase === "notify" && (
            <NotifyStep
              tokens={tokens}
              name={user?.name ?? null}
              analyzing={!resultsReady}
              onNext={advance}
            />
          )}
          {phase === "habit" && (
            <HabitStep tokens={tokens} analyzing={!resultsReady} onNext={advance} />
          )}
          {phase === "results" && (
            <ResultsStep
              tokens={tokens}
              poll={poll}
              onFinish={() => void finish({ skipped: false })}
            />
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </CoralScreen>
  );
}

// ── Chrome ───────────────────────────────────────────────────────────────

/** Continuous bar (Miro: "a progress bar, not steps"). */
function ProgressBar({ fraction }: { fraction: number }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      style={{
        height: 4,
        marginHorizontal: 24,
        marginTop: 12,
        borderRadius: 3,
        backgroundColor: "rgba(255,255,255,0.3)",
        overflow: "hidden",
      }}
    >
      <View style={{ width: `${pct}%`, height: "100%", backgroundColor: "#ffffff" }} />
    </View>
  );
}

function StepBody({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {footer ? <View style={{ paddingHorizontal: 24, paddingBottom: 16, gap: 8 }}>{footer}</View> : null}
    </View>
  );
}

function AnalyzingNote({ tokens, analyzing }: { tokens: Tokens; analyzing: boolean }) {
  const t = coralType(tokens);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 18 }}>
      {analyzing ? (
        <ActivityIndicator color="#ffffff" size="small" />
      ) : (
        <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
      )}
      <Text style={t.muted}>
        {analyzing
          ? "Analyzing your debrief. While we do, let's get your account set up."
          : "Your debrief is analyzed. Finish setting up, or jump to your results."}
      </Text>
    </View>
  );
}

function ResultsReadyBanner({ tokens, onPress }: { tokens: Tokens; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        marginHorizontal: 24,
        marginTop: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: tokens.radius.md,
        backgroundColor: "#ffffff",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Text style={{ fontFamily: tokens.fontSans, fontWeight: "700", fontSize: 15, color: tokens.primaryLo }}>
        Your results are ready
      </Text>
      <Ionicons name="arrow-forward" size={18} color={tokens.primaryLo} />
    </Pressable>
  );
}

// ── 1. Hello ─────────────────────────────────────────────────────────────

function HelloStep({
  tokens,
  name,
  onDone,
}: {
  tokens: Tokens;
  name: string | null;
  onDone: (enteredName: string | null) => void;
}) {
  const t = coralType(tokens);
  const known = name?.trim() || null;
  const first = known ? known.split(/\s+/)[0] : null;
  const [draft, setDraft] = useState("");

  if (first) {
    return (
      <StepBody footer={<FunnelCta label="Let's go" onPress={() => onDone(null)} tokens={tokens} onCoral />}>
        <Text style={[t.h1, { marginBottom: 14 }]}>Welcome back, {first}.</Text>
        <Text style={t.lead}>
          Your membership is active. Let's get your first debrief in. It takes about a minute.
        </Text>
      </StepBody>
    );
  }

  const cleaned = draft.trim();
  return (
    <StepBody
      footer={
        <FunnelCta
          label="Continue"
          onPress={() => onDone(cleaned ? cleaned.slice(0, 50) : null)}
          tokens={tokens}
          onCoral
        />
      }
    >
      <Text style={[t.h1, { marginBottom: 14 }]}>Welcome to Ripple.</Text>
      <Text style={[t.lead, { marginBottom: 22 }]}>
        Your membership is active. What should we call you?
      </Text>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="First name"
        placeholderTextColor="rgba(255,255,255,0.6)"
        autoCapitalize="words"
        autoCorrect={false}
        textContentType="givenName"
        returnKeyType="done"
        maxLength={50}
        onSubmitEditing={() => onDone(cleaned ? cleaned : null)}
        style={{
          fontFamily: tokens.fontSans,
          fontSize: 18,
          color: "#ffffff",
          borderBottomWidth: 1.5,
          borderBottomColor: "rgba(255,255,255,0.7)",
          paddingVertical: 10,
        }}
      />
    </StepBody>
  );
}

// ── 2. Value ─────────────────────────────────────────────────────────────

const VALUE_POINTS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: "mic-outline",
    title: "Talk for about a minute",
    body: "Say what's on your mind, unfiltered. No typing, no blank page.",
  },
  {
    icon: "list-outline",
    title: "Ripple sorts it out",
    body: "It pulls out the tasks, themes and what's weighing on you.",
  },
  {
    icon: "trending-up-outline",
    title: "Patterns you'd otherwise miss",
    body: "Over the weeks it shows what keeps coming up, so things stop slipping.",
  },
];

function ValueStep({ tokens, onNext }: { tokens: Tokens; onNext: () => void }) {
  const t = coralType(tokens);
  return (
    <StepBody footer={<FunnelCta label="Start my first debrief" onPress={onNext} tokens={tokens} onCoral />}>
      <Text style={[t.h1, { marginBottom: 22 }]}>Here's how Ripple helps.</Text>
      <View style={{ gap: 12 }}>
        {VALUE_POINTS.map((p) => (
          <View key={p.title} style={[coralWhiteCard(tokens, { tinted: true }), { flexDirection: "row", gap: 14 }]}>
            <Ionicons name={p.icon} size={22} color="#ffffff" style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={[t.cardTitle, { marginBottom: 4 }]}>{p.title}</Text>
              <Text style={t.body}>{p.body}</Text>
            </View>
          </View>
        ))}
      </View>
    </StepBody>
  );
}

// ── 3. Consent (before any audio leaves the device) ─────────────────────

function ConsentStep({
  tokens,
  alreadyAgreed,
  onAgreed,
  onSkip,
}: {
  tokens: Tokens;
  alreadyAgreed: boolean;
  onAgreed: () => void;
  onSkip: () => void;
}) {
  const t = coralType(tokens);
  const [accepted, setAccepted] = useState(alreadyAgreed);
  const [details, setDetails] = useState(false);
  const [busy, setBusy] = useState(false);

  const onContinue = async () => {
    if (!accepted || busy) return;
    setBusy(true);
    try {
      if (!alreadyAgreed) {
        // Fail soft, like the onboarding consent step: trapping a paying
        // user on a ledger write is worse than a missing row we can re-ask.
        await recordConsent({
          consentType: "special_category_processing",
          granted: true,
          consentText: ART9_CONSENT_TEXT,
          wordingVersion: ART9_WORDING_VERSION,
        }).catch((err) => console.warn("[welcome] consent record failed:", err));
      }
      onAgreed();
    } finally {
      setBusy(false);
    }
  };

  const onDecline = () => {
    Alert.alert(
      "AI processing is how Ripple works",
      "Your debriefs, themes and weekly reports all come from AI processing your recordings. Without your consent Ripple can't analyze them.",
      [
        { text: "Go back", style: "cancel" },
        { text: "Skip for now", onPress: onSkip },
      ]
    );
  };

  return (
    <StepBody
      footer={
        <>
          <FunnelCta
            label="Start my first debrief"
            onPress={onContinue}
            tokens={tokens}
            disabled={!accepted}
            busy={busy}
            onCoral
          />
          <Pressable onPress={onDecline} style={{ paddingVertical: 10, alignItems: "center" }}>
            <Text style={coralType(tokens).muted}>I don't consent</Text>
          </Pressable>
        </>
      }
    >
      <Text style={[t.h1, { marginBottom: 14 }]}>Before you record</Text>
      <Text style={[t.lead, { marginBottom: 14 }]}>
        Ripple uses AI to turn your recording into tasks and themes: OpenAI (Whisper) transcribes
        it and Anthropic (Claude) analyzes it. Never sold, never used to train AI.
      </Text>

      <Pressable
        onPress={() => setDetails((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: details }}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: details ? 10 : 20 }}
      >
        <Text style={{ fontFamily: tokens.fontSans, fontWeight: "700", fontSize: 15, color: "#ffffff" }}>
          What we collect, and what we don't
        </Text>
        <Ionicons name={details ? "chevron-up" : "chevron-down"} size={16} color="#ffffff" />
      </Pressable>
      {details ? (
        <View style={[coralWhiteCard(tokens, { tinted: true }), { marginBottom: 20, gap: 10 }]}>
          <Text style={coralLabel(tokens)}>We collect</Text>
          <Text style={t.body}>• Your recording and its transcript</Text>
          <Text style={t.body}>• What Ripple pulls from it: tasks, themes, mood</Text>
          <Text style={[coralLabel(tokens), { marginTop: 6 }]}>We don't</Text>
          <Text style={t.body}>• Sell your data</Text>
          <Text style={t.body}>• Let AI providers train their models on it</Text>
          <Text style={t.body}>• Send it unencrypted (it's encrypted in transit)</Text>
          <Text style={[t.muted, { marginTop: 6 }]}>
            You can delete any entry, or your whole account, at any time.
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={() => setAccepted((v) => !v)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
        accessibilityLabel="I explicitly consent to Ripple transcribing and analysing voice entries that may contain special-category information"
        style={[coralWhiteCard(tokens, { tinted: true }), { flexDirection: "row", gap: 12 }]}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: "#ffffff",
            backgroundColor: accepted ? "#ffffff" : "transparent",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 2,
          }}
        >
          {accepted ? <Ionicons name="checkmark" size={16} color={tokens.primaryLo} /> : null}
        </View>
        <Text style={[t.muted, { flex: 1 }]}>{ART9_CONSENT_TEXT}</Text>
      </Pressable>
    </StepBody>
  );
}

// ── 5. Notifications (while analyzing) ───────────────────────────────────

function NotifyStep({
  tokens,
  name,
  analyzing,
  onNext,
}: {
  tokens: Tokens;
  name: string | null;
  analyzing: boolean;
  onNext: () => void;
}) {
  const t = coralType(tokens);
  const [selected, setSelected] = useState<ReminderSlot | null>(null);
  const [busy, setBusy] = useState(false);

  const onConfirm = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      // Persist BEFORE the OS prompt (same reasoning as v10 Screen 8), and
      // through the existing reminders API the scheduler already reads.
      const time = localTimeFor(selected);
      await api
        .put("/api/account/reminders", {
          reminders: time ? [{ time, daysActive: [0, 1, 2, 3, 4, 5, 6], enabled: true }] : [],
        })
        .catch(() => {});
      if (shouldPromptForPush(selected)) {
        const result = await registerPushTokenForReminderSlot();
        void trackOnboardingEvent("v10_welcome_push_prompt", { value: String(result) });
      }
      onNext();
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepBody
      footer={
        selected ? (
          <FunnelCta
            label={shouldPromptForPush(selected) ? "Sounds good" : "Continue"}
            onPress={onConfirm}
            tokens={tokens}
            busy={busy}
            onCoral
          />
        ) : null
      }
    >
      <AnalyzingNote tokens={tokens} analyzing={analyzing} />
      <Text style={[t.h1, { fontSize: 26, lineHeight: 32, marginBottom: 20 }]}>
        {headlineFor(name?.trim().split(/\s+/)[0] ?? null)}
      </Text>
      <View style={{ gap: 10, marginBottom: 18 }}>
        {REMINDER_SLOTS.map((slot) => {
          const on = selected === slot.key;
          return (
            <Pressable
              key={slot.key}
              onPress={() => setSelected(slot.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={{
                borderWidth: on ? 2 : 1,
                borderColor: on ? "#ffffff" : "rgba(255,255,255,0.4)",
                borderRadius: tokens.radius.md,
                paddingVertical: 16,
                paddingHorizontal: 18,
                backgroundColor: on ? "#ffffff" : "rgba(255,255,255,0.12)",
              }}
            >
              <Text
                style={{
                  fontFamily: tokens.fontSans,
                  fontSize: 16,
                  fontWeight: on ? "700" : "500",
                  color: on ? tokens.primaryLo : "#ffffff",
                }}
              >
                {slot.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {selected && shouldPromptForPush(selected) ? <Text style={t.body}>{REMINDER_PRIMER}</Text> : null}
    </StepBody>
  );
}

// ── 6. First habit (while analyzing) ─────────────────────────────────────

const REFLECTION_CHIP = "Daily reflection with Ripple";

function HabitStep({
  tokens,
  analyzing,
  onNext,
}: {
  tokens: Tokens;
  analyzing: boolean;
  onNext: () => void;
}) {
  const t = coralType(tokens);
  const [picked, setPicked] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);

  const habitName = (custom.trim() || picked || "").slice(0, 80);

  const onAdd = async () => {
    if (!habitName || busy) return;
    setBusy(true);
    try {
      if (!custom.trim() && picked === REFLECTION_CHIP) {
        await addReflectionHabit().catch(() => null);
      } else {
        await createHabit(habitName).catch(() => null);
      }
      void trackOnboardingEvent("v10_welcome_habit_added", { value: habitName });
      onNext();
    } finally {
      setBusy(false);
    }
  };

  const chips = [REFLECTION_CHIP, ...WELCOME_HABIT_SUGGESTIONS];

  return (
    <StepBody
      footer={
        <>
          <FunnelCta
            label="Add this habit"
            onPress={onAdd}
            tokens={tokens}
            disabled={!habitName}
            busy={busy}
            onCoral
          />
          <Pressable onPress={onNext} style={{ paddingVertical: 10, alignItems: "center" }}>
            <Text style={t.muted}>Skip for now</Text>
          </Pressable>
        </>
      }
    >
      <AnalyzingNote tokens={tokens} analyzing={analyzing} />
      <Text style={[t.h1, { fontSize: 26, lineHeight: 32, marginBottom: 10 }]}>
        Want to add your first habit to track?
      </Text>
      <Text style={[t.body, { marginBottom: 18 }]}>
        Mention it in a debrief and Ripple checks it off for you.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
        {chips.map((c) => {
          const on = picked === c && !custom.trim();
          return (
            <Pressable
              key={c}
              onPress={() => {
                setPicked(c);
                setCustom("");
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={coralChipStyle({ selected: on })}
            >
              <Text
                style={{
                  fontFamily: tokens.fontSans,
                  fontSize: 15,
                  fontWeight: on ? "700" : "500",
                  color: on ? tokens.primaryLo : "#ffffff",
                }}
              >
                {c}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        value={custom}
        onChangeText={setCustom}
        placeholder="Or type your own"
        placeholderTextColor="rgba(255,255,255,0.6)"
        maxLength={80}
        returnKeyType="done"
        style={{
          fontFamily: tokens.fontSans,
          fontSize: 16,
          color: "#ffffff",
          borderBottomWidth: 1.5,
          borderBottomColor: "rgba(255,255,255,0.7)",
          paddingVertical: 10,
        }}
      />
    </StepBody>
  );
}

// ── 7. Results ───────────────────────────────────────────────────────────

function tasksFrom(raw: unknown): string[] {
  const tasks = (raw as { tasks?: unknown } | null)?.tasks;
  if (!Array.isArray(tasks)) return [];
  return tasks
    .map((x) => (x && typeof (x as { title?: unknown }).title === "string" ? (x as { title: string }).title : null))
    .filter((x): x is string => !!x)
    .slice(0, 3);
}

function ResultsStep({
  tokens,
  poll,
  onFinish,
}: {
  tokens: Tokens;
  poll: ReturnType<typeof useEntryPolling>;
  onFinish: () => void;
}) {
  const t = coralType(tokens);
  const done = poll.status === "complete" || poll.status === "partial";
  const failed = poll.status === "failed";
  const slow = poll.status === "timeout";
  const entry = poll.entry;
  const tasks = done ? tasksFrom(entry?.rawAnalysis) : [];
  const themes = done ? (entry?.themes ?? []).slice(0, 4) : [];

  return (
    <StepBody footer={<FunnelCta label="Show me around" onPress={onFinish} tokens={tokens} onCoral />}>
      {!done && !failed && !slow ? (
        <View style={{ alignItems: "center", paddingTop: 40, gap: 14 }}>
          <ActivityIndicator color="#ffffff" />
          <Text style={t.lead}>Finishing your debrief…</Text>
        </View>
      ) : null}

      {failed ? (
        <>
          <Text style={[t.h1, { marginBottom: 14 }]}>That one didn't finish.</Text>
          <Text style={t.lead}>
            Your recording is saved. You'll find it in Entries, where you can try it again.
          </Text>
        </>
      ) : null}

      {slow ? (
        <>
          <Text style={[t.h1, { marginBottom: 14 }]}>Still working on it.</Text>
          <Text style={t.lead}>
            Your debrief is taking a little longer. It'll be waiting in Entries, and we'll let you
            know when it's ready.
          </Text>
        </>
      ) : null}

      {done ? (
        <>
          <Text style={coralLabel(tokens)}>Your first debrief</Text>
          <Text style={[t.h1, { marginTop: 8, marginBottom: 16 }]}>Here's what Ripple heard.</Text>
          {entry?.summary ? (
            <View style={[coralWhiteCard(tokens, { tinted: true }), { marginBottom: 14 }]}>
              <Text style={t.body}>{entry.summary}</Text>
            </View>
          ) : null}
          {tasks.length ? (
            <View style={[coralWhiteCard(tokens, { tinted: true }), { marginBottom: 14, gap: 8 }]}>
              <Text style={coralLabel(tokens)}>Tasks it pulled out</Text>
              {tasks.map((task) => (
                <View key={task} style={{ flexDirection: "row", gap: 8 }}>
                  <Ionicons name="checkbox-outline" size={18} color="#ffffff" style={{ marginTop: 2 }} />
                  <Text style={[t.body, { flex: 1 }]}>{task}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {themes.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {themes.map((th) => (
                <View key={th} style={coralChipStyle({ selected: false })}>
                  <Text style={{ fontFamily: tokens.fontSans, fontSize: 14, color: "#ffffff" }}>{th}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </StepBody>
  );
}
