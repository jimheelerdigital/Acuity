import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { WELCOME_TOUR_KEY, type WelcomeTourRequest } from "@/components/tour/welcome-tour";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { useEntryPolling } from "@/hooks/use-entry-polling";
import { api } from "@/lib/api";
import { ART9_CONSENT_TEXT, ART9_WORDING_VERSION, recordConsent } from "@/lib/consent";
import { isHabitsEnabled } from "@/lib/feature-flags";
import { addReflectionHabit, createHabit } from "@/lib/habits-api";
import { trackOnboardingEvent } from "@/lib/onboarding-events";
import {
  REMINDER_SLOTS,
  localTimeFor,
  shouldPromptForPush,
  type ReminderSlot,
} from "@/lib/onboarding-v10/reminders";
import { registerPushTokenForReminderSlot } from "@/lib/push-token";
import { bumpDebriefSignal } from "@/lib/review";
import { makeAcuityTokens, type AcuityTokens } from "@/lib/theme/tokens";
import {
  WELCOME_HABIT_SUGGESTIONS,
  clearWelcome,
  loadWelcome,
  nextPhase,
  phasesFor,
  progressFor,
  resumePhase,
  saveWelcome,
  setupSteps,
  stepOf,
  type WelcomeOpts,
  type WelcomePhase,
} from "@/lib/welcome/flow";
import { WELCOME_CORAL as C } from "@/lib/welcome/look";

/**
 * Funnel welcome flow — first run for someone who already paid on the web.
 *
 * Design approved by Jimmy 2026-10-12 ("Ripple Welcome Flow Redesign"
 * canvas): a deeper coral so white type reads, real content in white cards
 * instead of text on an empty screen, a setup checklist up front, and the
 * app tour as the LAST setup step on the real tabs (welcome mode in
 * components/tour/TourProvider.tsx) with the same progress bar. Step order
 * and rules: lib/welcome/phases.ts. Routing: lib/onboarding-v10/
 * entry-routing.ts; flag EXPO_PUBLIC_FUNNEL_WELCOME.
 *
 * A first debrief recorded here goes through the REAL recorder
 * (/record?from=welcome), so it is a normal entry on the normal pipeline.
 * The recorder stores the entry id via noteWelcomeDebrief() and pops back;
 * this screen polls it while the user sets up, then shows results.
 */

type Tokens = AcuityTokens;

const HEADING = "Manrope_800ExtraBold";

export default function WelcomeScreen() {
  const { palette } = useTheme();
  const tokens = useMemo(() => makeAcuityTokens({ dark: false, accent: palette }), [palette]);
  const { user, refresh, setAuthenticatedUser } = useAuth();
  // Frozen for the whole visit: the server flags can flip mid-flow (e.g.
  // hasAiConsent after they agree here), and a step list that changes
  // under the user would break nextPhase / progress.
  const [opts] = useState<WelcomeOpts>(() => ({
    habitsEnabled: isHabitsEnabled(),
    skipConsent: user?.hasAiConsent === true,
    skipRecord: Boolean(user?.webDebriefEntryId),
  }));
  // Their web first debrief, when they did one (shown on the results step).
  const [webEntryId] = useState<string | null>(() => user?.webDebriefEntryId ?? null);
  const webDebriefDone = opts.skipRecord === true;

  const [phase, setPhase] = useState<WelcomePhase | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [checkIn, setCheckIn] = useState<ReminderSlot | null>(null);

  // (Re)load on every focus: the recorder writes the entry id to storage
  // and pops back, and this is how that hand-off arrives.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void loadWelcome().then((s) => {
        if (cancelled) return;
        const id = s.entryId ?? webEntryId;
        setEntryId(id);
        setPhase(resumePhase(s.phase, id, opts));
      });
      return () => {
        cancelled = true;
      };
    }, [opts, webEntryId])
  );

  useEffect(() => {
    if (phase) void trackOnboardingEvent("v10_welcome_viewed", { value: phase });
  }, [phase]);

  const poll = useEntryPolling(entryId);
  const resultsReady = poll.status === "complete" || poll.status === "partial";
  const firstName = user?.name?.trim().split(/\s+/)[0] || null;

  const go = useCallback(
    (to: WelcomePhase) => {
      setPhase(to);
      void saveWelcome({ phase: to, entryId });
    },
    [entryId]
  );

  /**
   * Leave the setup screens. Same optimistic pattern as the onboarding
   * shell: flip local state first so AuthGate can't bounce them back here,
   * hand the tour its request, navigate, then write to the server.
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
          // Cleared locally too, or AuthGate sends them straight back here
          // before /api/onboarding/complete + refresh land.
          welcomeEligible: false,
          totalRecordings: Math.max(user.totalRecordings ?? 0, entryId ? 1 : 0),
        });
      }
      await clearWelcome();
      // The web debrief is a real completed debrief: count it toward the
      // rating ask, so it comes after their first one recorded in the app
      // (their second overall). Jimmy, 2026-10-12.
      if (webEntryId) await bumpDebriefSignal();
      // The tour is the last setup step (Home picks this up on focus).
      const time = checkIn ? localTimeFor(checkIn) : null;
      const req: WelcomeTourRequest = {
        setupScreens: phasesFor(opts).length,
        stepOf: setupSteps(opts).length,
        firstName,
        checkInTime: time ? formatTime(time) : null,
      };
      await AsyncStorage.setItem(WELCOME_TOUR_KEY, JSON.stringify(req)).catch(() => {});
      router.replace("/(tabs)");
      void api
        .post("/api/onboarding/complete", skipped ? { skipped: true, skippedAtStep: 1 } : { skipped: false })
        .catch((err) => console.error("[welcome] complete failed:", err))
        .finally(() => {
          void refresh().catch(() => {});
        });
    },
    [phase, user, entryId, webEntryId, checkIn, opts, firstName, setAuthenticatedUser, refresh]
  );

  /** Next setup screen, or the tour when this was the last one. */
  const advance = useCallback(() => {
    if (!phase) return;
    const to = nextPhase(phase, opts);
    if (to) go(to);
    else void finish({ skipped: false });
  }, [phase, opts, go, finish]);

  if (!phase) {
    return (
      <WelcomeBackground>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color="#ffffff" />
        </View>
      </WelcomeBackground>
    );
  }

  const progress = progressFor(phase, opts);
  const step = stepOf(phase, opts);
  const banner =
    !webDebriefDone && resultsReady && (phase === "notify" || phase === "habit") ? (
      <ResultsReadyBanner tokens={tokens} onPress={() => go("results")} />
    ) : null;

  return (
    <WelcomeBackground>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ProgressBar fraction={progress} />
          {banner}
          {phase === "hello" && (
            <HelloStep
              tokens={tokens}
              name={user?.name ?? null}
              opts={opts}
              webDebriefDone={webDebriefDone}
              onDone={(name) => {
                if (name && user) {
                  setAuthenticatedUser({ ...user, name });
                  void api.post("/api/user/name", { name }).catch(() => {});
                }
                advance();
              }}
            />
          )}
          {(phase === "consent" || phase === "record") && (
            <ConsentStep
              tokens={tokens}
              step={step}
              alreadyAgreed={phase === "record"}
              webDebriefDone={webDebriefDone}
              onAgreed={() => {
                if (webDebriefDone) {
                  // Debrief already done on the web: on to the next step.
                  advance();
                  return;
                }
                go("record");
                router.push("/record?from=welcome" as never);
              }}
              onSkip={() => void finish({ skipped: true })}
            />
          )}
          {phase === "results" && (
            <ResultsStep
              tokens={tokens}
              step={step}
              poll={poll}
              webDebriefDone={webDebriefDone}
              isLastSetupStep={nextPhase(phase, opts) === null}
              onNext={advance}
            />
          )}
          {phase === "notify" && (
            <NotifyStep
              tokens={tokens}
              step={step}
              analyzing={!webDebriefDone && !resultsReady}
              onNext={(slot) => {
                setCheckIn(slot);
                advance();
              }}
            />
          )}
          {phase === "habit" && (
            <HabitStep tokens={tokens} step={step} analyzing={!webDebriefDone && !resultsReady} onNext={advance} />
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </WelcomeBackground>
  );
}

// ── Chrome ───────────────────────────────────────────────────────────────

/** "21:00" → "9:00 PM". */
function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function WelcomeBackground({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.mid }}>
      <LinearGradient
        colors={[C.top, C.mid, C.bottom]}
        locations={[0, 0.48, 1]}
        start={{ x: 0.4, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        // Decorative only: must never intercept touches.
        style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}
      />
      {children}
    </View>
  );
}

/** One continuous bar across setup and tour (Miro: "a progress bar, not steps"). */
function ProgressBar({ fraction }: { fraction: number }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      style={{
        height: 4,
        marginHorizontal: 20,
        marginTop: 12,
        borderRadius: 3,
        backgroundColor: "rgba(255,255,255,0.28)",
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
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 26, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {footer ? <View style={{ paddingHorizontal: 20, paddingBottom: 14, gap: 4 }}>{footer}</View> : null}
    </View>
  );
}

/** White pill CTA with coral text — the one primary action on every screen. */
function PrimaryButton({
  label,
  onPress,
  tokens,
  disabled = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  tokens: Tokens;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled || busy ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={({ pressed }) => ({
        height: 58,
        borderRadius: 999,
        backgroundColor: "#ffffff",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.5 : pressed ? 0.88 : 1,
        shadowColor: "#501405",
        shadowOpacity: 0.2,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 10 },
      })}
    >
      {busy ? (
        <ActivityIndicator color={C.ink} />
      ) : (
        <Text style={{ fontFamily: tokens.fontSans, fontSize: 18, fontWeight: "700", color: C.ink }}>{label}</Text>
      )}
    </Pressable>
  );
}

function TextLink({ label, onPress, tokens }: { label: string; onPress: () => void; tokens: Tokens }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: tokens.fontSans, fontSize: 14, color: "rgba(255,255,255,0.88)" }}>{label}</Text>
    </Pressable>
  );
}

function Eyebrow({ text, tokens }: { text: string; tokens: Tokens }) {
  return (
    <Text
      style={{
        fontFamily: tokens.fontSans,
        fontSize: 13,
        fontWeight: "700",
        letterSpacing: 1.3,
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.9)",
      }}
    >
      {text}
    </Text>
  );
}

function Title({ children, size = 32 }: { children: React.ReactNode; size?: number }) {
  return (
    <Text style={{ marginTop: 8, fontFamily: HEADING, fontSize: size, lineHeight: size * 1.12, color: "#ffffff", letterSpacing: -0.5 }}>
      {children}
    </Text>
  );
}

function Lead({ children, tokens }: { children: React.ReactNode; tokens: Tokens }) {
  return (
    <Text style={{ marginTop: 10, fontFamily: tokens.fontSans, fontSize: 16, lineHeight: 23, color: "rgba(255,255,255,0.95)" }}>
      {children}
    </Text>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View
      style={[
        {
          backgroundColor: "#ffffff",
          borderRadius: 22,
          padding: 18,
          shadowColor: "#501405",
          shadowOpacity: 0.2,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 18 },
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function Chip({ label, tokens }: { label: string; tokens: Tokens }) {
  return (
    <View style={{ backgroundColor: C.chipBg, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}>
      <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, fontWeight: "600", color: C.chipInk }}>{label}</Text>
    </View>
  );
}

function stepLabel(step: { n: number; of: number } | null, suffix?: string): string {
  const base = step ? `Step ${step.n} of ${step.of}` : "";
  return suffix ? (base ? `${base} · ${suffix}` : suffix) : base;
}

function AnalyzingPill({ tokens }: { tokens: Tokens }) {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: "rgba(255,255,255,0.16)",
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: 12,
        marginBottom: 14,
      }}
    >
      <ActivityIndicator color="#ffffff" size="small" />
      <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, fontWeight: "600", color: "#ffffff" }}>
        Analyzing your debrief
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
        marginHorizontal: 20,
        marginTop: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 16,
        backgroundColor: "#ffffff",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Text style={{ fontFamily: tokens.fontSans, fontWeight: "700", fontSize: 15, color: C.ink }}>Your results are ready</Text>
      <Ionicons name="arrow-forward" size={18} color={C.ink} />
    </Pressable>
  );
}

// ── Hello + setup checklist ─────────────────────────────────────────────

function CheckRow({
  tokens,
  label,
  state,
  n,
  aside,
  last,
}: {
  tokens: Tokens;
  label: string;
  state: "done" | "next" | "todo";
  n?: number;
  aside?: string;
  last?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingVertical: 13,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: tokens.lineStrong,
      }}
    >
      {state === "done" ? (
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.good, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="checkmark" size={16} color="#ffffff" />
        </View>
      ) : (
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            borderWidth: 2,
            borderColor: state === "next" ? tokens.primaryLo : tokens.bgInsetStrong,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, fontWeight: "700", color: state === "next" ? C.chipInk : tokens.textTer }}>
            {n}
          </Text>
        </View>
      )}
      <Text
        style={{
          flex: 1,
          fontFamily: tokens.fontSans,
          fontSize: 16,
          fontWeight: "600",
          color: state === "todo" ? tokens.textSec : tokens.text,
        }}
      >
        {label}
      </Text>
      {aside ? <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, color: tokens.textTer }}>{aside}</Text> : null}
    </View>
  );
}

function HelloStep({
  tokens,
  name,
  opts,
  webDebriefDone,
  onDone,
}: {
  tokens: Tokens;
  name: string | null;
  opts: WelcomeOpts;
  webDebriefDone: boolean;
  onDone: (enteredName: string | null) => void;
}) {
  const known = name?.trim() || null;
  const first = known ? known.split(/\s+/)[0] : null;
  const [draft, setDraft] = useState("");
  const cleaned = draft.trim().slice(0, 50);
  const steps = setupSteps(opts);

  return (
    <StepBody footer={<PrimaryButton label="Let's go" tokens={tokens} onPress={() => onDone(first ? null : cleaned || null)} />}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: "rgba(255,255,255,0.18)",
            borderWidth: 1.5,
            borderColor: "rgba(255,255,255,0.5)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {first ? (
            <Text style={{ fontFamily: HEADING, fontSize: 22, color: "#ffffff" }}>{first.charAt(0).toUpperCase()}</Text>
          ) : (
            <Ionicons name="person" size={24} color="#ffffff" />
          )}
        </View>
        <Eyebrow text="Membership active" tokens={tokens} />
      </View>
      <Title size={36}>{first ? `Welcome back, ${first}.` : "Welcome to Ripple."}</Title>
      <Lead tokens={tokens}>
        {webDebriefDone
          ? "Your first debrief is saved. A minute of setup and you're in."
          : "A minute of setup, then your first debrief."}
      </Lead>

      {!first ? (
        <Card style={{ marginTop: 22, paddingVertical: 14 }}>
          <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: tokens.textTer }}>
            What should we call you?
          </Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="First name"
            placeholderTextColor={tokens.textQuiet}
            autoCapitalize="words"
            autoCorrect={false}
            textContentType="givenName"
            returnKeyType="done"
            maxLength={50}
            style={{ marginTop: 6, fontFamily: tokens.fontSans, fontSize: 18, color: tokens.text, paddingVertical: 8 }}
          />
        </Card>
      ) : null}

      <Card style={{ marginTop: first ? 26 : 12, paddingVertical: 4 }}>
        <CheckRow tokens={tokens} label="Membership active" state="done" />
        {webDebriefDone ? <CheckRow tokens={tokens} label="First debrief saved" state="done" /> : null}
        {steps.map((s, i) => (
          <CheckRow
            key={s.key}
            tokens={tokens}
            label={s.label}
            n={i + 1}
            state={i === 0 ? "next" : "todo"}
            last={i === steps.length - 1}
          />
        ))}
      </Card>
    </StepBody>
  );
}

// ── Consent (before any audio leaves the device) ───────────────────────

function ProviderRow({ tokens, icon, title, body }: { tokens: Tokens; icon: keyof typeof Ionicons.glyphMap; title: string; body: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.chipBg, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={20} color={C.chipInk} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: tokens.fontSans, fontSize: 15, fontWeight: "700", color: tokens.text }}>{title}</Text>
        <Text style={{ marginTop: 2, fontFamily: tokens.fontSans, fontSize: 14, lineHeight: 19, color: tokens.textSec }}>{body}</Text>
      </View>
    </View>
  );
}

function ConsentStep({
  tokens,
  step,
  alreadyAgreed,
  webDebriefDone,
  onAgreed,
  onSkip,
}: {
  tokens: Tokens;
  step: { n: number; of: number } | null;
  alreadyAgreed: boolean;
  /** First debrief already done on the web: no recorder follows. */
  webDebriefDone: boolean;
  onAgreed: () => void;
  onSkip: () => void;
}) {
  const [accepted, setAccepted] = useState(alreadyAgreed);
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

  const cta = alreadyAgreed ? "Start my first debrief" : "I agree";

  return (
    <StepBody
      footer={
        <>
          <PrimaryButton label={cta} tokens={tokens} onPress={onContinue} disabled={!accepted} busy={busy} />
          {alreadyAgreed ? null : <TextLink label="I don't consent" tokens={tokens} onPress={onDecline} />}
        </>
      }
    >
      <Eyebrow text={stepLabel(step)} tokens={tokens} />
      <Title>{alreadyAgreed && !webDebriefDone ? "Ready when you are" : "How Ripple uses AI"}</Title>

      <Card style={{ marginTop: 20, gap: 14 }}>
        <ProviderRow tokens={tokens} icon="mic-outline" title="OpenAI Whisper transcribes" body="Turns your voice into text." />
        <ProviderRow tokens={tokens} icon="list-outline" title="Anthropic Claude analyzes" body="Finds your tasks, themes and mood." />
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: tokens.lineStrong }} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          {["Never sold", "Never trains AI", "Delete anytime"].map((p) => (
            <View key={p} style={{ flex: 1, backgroundColor: tokens.bg, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 6 }}>
              <Text style={{ textAlign: "center", fontFamily: tokens.fontSans, fontSize: 13, fontWeight: "600", color: tokens.text }}>{p}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Pressable
        onPress={() => (alreadyAgreed ? null : setAccepted((v) => !v))}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted, disabled: alreadyAgreed }}
        accessibilityLabel="I explicitly consent to Ripple transcribing and analysing voice entries that may contain special-category information"
        style={{
          marginTop: 14,
          flexDirection: "row",
          gap: 12,
          alignItems: "flex-start",
          backgroundColor: "rgba(255,255,255,0.14)",
          borderWidth: 1.5,
          borderColor: "rgba(255,255,255,0.55)",
          borderRadius: 18,
          padding: 14,
        }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            borderWidth: 2,
            borderColor: "#ffffff",
            backgroundColor: accepted ? "#ffffff" : "transparent",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 1,
          }}
        >
          {accepted ? <Ionicons name="checkmark" size={16} color={C.ink} /> : null}
        </View>
        <Text style={{ flex: 1, fontFamily: tokens.fontSans, fontSize: 13, lineHeight: 19, color: "#ffffff" }}>
          {ART9_CONSENT_TEXT}
        </Text>
      </Pressable>
    </StepBody>
  );
}

// ── Results ──────────────────────────────────────────────────────────────

function tasksFrom(raw: unknown): string[] {
  const tasks = (raw as { tasks?: unknown } | null)?.tasks;
  if (!Array.isArray(tasks)) return [];
  return tasks
    .map((x) => (x && typeof (x as { title?: unknown }).title === "string" ? (x as { title: string }).title : null))
    .filter((x): x is string => !!x)
    .slice(0, 4);
}

function sentenceCase(s: string): string {
  const t = s.trim().replace(/_/g, " ");
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t;
}

function ResultsStep({
  tokens,
  step,
  poll,
  webDebriefDone,
  isLastSetupStep,
  onNext,
}: {
  tokens: Tokens;
  step: { n: number; of: number } | null;
  poll: ReturnType<typeof useEntryPolling>;
  webDebriefDone: boolean;
  isLastSetupStep: boolean;
  onNext: () => void;
}) {
  const done = poll.status === "complete" || poll.status === "partial";
  const failed = poll.status === "failed";
  const slow = poll.status === "timeout";
  const entry = poll.entry;
  const tasks = done ? tasksFrom(entry?.rawAnalysis) : [];
  const themes = done ? (entry?.themes ?? []).slice(0, 4) : [];
  const mood = done && entry?.mood ? sentenceCase(entry.mood) : null;

  return (
    <StepBody footer={<PrimaryButton label={isLastSetupStep ? "Show me around" : "Continue"} tokens={tokens} onPress={onNext} />}>
      <Eyebrow text={stepLabel(step, "Your first debrief")} tokens={tokens} />
      <Title>{done ? "Here's what Ripple heard." : failed ? "That one didn't finish." : slow ? "Still working on it." : "Finishing your debrief…"}</Title>

      {!done && !failed && !slow ? (
        <Card style={{ marginTop: 20, alignItems: "center", gap: 12, paddingVertical: 28 }}>
          <ActivityIndicator color={C.ink} />
          <Text style={{ fontFamily: tokens.fontSans, fontSize: 15, color: tokens.textSec }}>Pulling out your tasks and themes</Text>
        </Card>
      ) : null}

      {failed || slow ? (
        <Card style={{ marginTop: 20 }}>
          <Text style={{ fontFamily: tokens.fontSans, fontSize: 16, lineHeight: 23, color: tokens.text }}>
            {failed
              ? "Your recording is saved. You'll find it in Entries, where you can try it again."
              : "It'll be waiting in Entries, and we'll let you know when it's ready."}
          </Text>
        </Card>
      ) : null}

      {done ? (
        <>
          <Card style={{ marginTop: 20 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, fontWeight: "600", color: tokens.textTer }}>
                {webDebriefDone ? "From the web" : "Just now"}
              </Text>
              {mood ? (
                <View style={{ backgroundColor: `${tokens.secondary}1f`, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 }}>
                  <Text style={{ fontFamily: tokens.fontSans, fontSize: 12, fontWeight: "700", color: tokens.secondaryLo }}>{mood}</Text>
                </View>
              ) : null}
            </View>
            {entry?.summary ? (
              <Text style={{ marginTop: 12, fontFamily: tokens.fontSans, fontSize: 16, lineHeight: 24, color: tokens.text }}>{entry.summary}</Text>
            ) : null}
            {themes.length ? (
              <View style={{ marginTop: 14, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {themes.map((th) => (
                  <Chip key={th} label={th} tokens={tokens} />
                ))}
              </View>
            ) : null}
          </Card>
          <Card style={{ marginTop: 12, paddingVertical: 16 }}>
            <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: tokens.textTer }}>
              Tasks Ripple pulled out
            </Text>
            {tasks.length ? (
              <View style={{ marginTop: 10, gap: 10 }}>
                {tasks.map((task) => (
                  <View key={task} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                    <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: tokens.bgInsetStrong }} />
                    <Text style={{ flex: 1, fontFamily: tokens.fontSans, fontSize: 15, fontWeight: "600", color: tokens.text }}>{task}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ marginTop: 8, fontFamily: tokens.fontSans, fontSize: 15, lineHeight: 21, color: tokens.textSec }}>
                None in this one. Mention a to-do next time and it lands on your list.
              </Text>
            )}
          </Card>
        </>
      ) : null}
    </StepBody>
  );
}

// ── Daily check-in ───────────────────────────────────────────────────────

/** Real reminder copy from apps/web/src/inngest/functions/notifications-twice-daily.ts. */
const PREVIEW_COPY: Record<Exclude<ReminderSlot, "none">, { title: string; body: string }> = {
  morning: { title: "Morning check-in", body: "What's on your mind before the day starts?" },
  midday: { title: "Quick check-in", body: "What's surfacing right now?" },
  after_work: { title: "Wind down", body: "How did today actually go?" },
  late: { title: "Wind down", body: "How did today actually go?" },
};

function NotifyStep({
  tokens,
  step,
  analyzing,
  onNext,
}: {
  tokens: Tokens;
  step: { n: number; of: number } | null;
  analyzing: boolean;
  onNext: (slot: ReminderSlot) => void;
}) {
  const [selected, setSelected] = useState<Exclude<ReminderSlot, "none">>("late");
  const [busy, setBusy] = useState(false);
  const slots = REMINDER_SLOTS.filter((s) => s.key !== "none") as { key: Exclude<ReminderSlot, "none">; label: string; localTime: string | null }[];
  const preview = PREVIEW_COPY[selected];
  const previewTime = formatTime(localTimeFor(selected) ?? "21:00");

  const save = async (slot: ReminderSlot) => {
    if (busy) return;
    setBusy(true);
    try {
      // Persist BEFORE the OS prompt (same reasoning as v10 Screen 8), and
      // through the existing reminders API the scheduler already reads.
      const time = localTimeFor(slot);
      await api
        .put("/api/account/reminders", {
          reminders: time ? [{ time, daysActive: [0, 1, 2, 3, 4, 5, 6], enabled: true }] : [],
        })
        .catch(() => {});
      if (shouldPromptForPush(slot)) {
        const result = await registerPushTokenForReminderSlot();
        void trackOnboardingEvent("v10_welcome_push_prompt", { value: String(result) });
      }
      onNext(slot);
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepBody
      footer={
        <>
          <PrimaryButton label="Turn on reminders" tokens={tokens} onPress={() => void save(selected)} busy={busy} />
          <TextLink label="No reminders for now" tokens={tokens} onPress={() => void save("none")} />
        </>
      }
    >
      {analyzing ? <AnalyzingPill tokens={tokens} /> : null}
      <Eyebrow text={stepLabel(step)} tokens={tokens} />
      <Title>When should we check in?</Title>
      <Lead tokens={tokens}>One nudge a day. No guilt, no streaks.</Lead>

      <View style={{ marginTop: 20, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {slots.map((slot) => {
          const on = selected === slot.key;
          return (
            <Pressable
              key={slot.key}
              onPress={() => setSelected(slot.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={{
                width: "48%",
                flexGrow: 1,
                borderRadius: 18,
                padding: 14,
                borderWidth: 2,
                borderColor: on ? "#ffffff" : "rgba(255,255,255,0.45)",
                backgroundColor: on ? "#ffffff" : "rgba(255,255,255,0.12)",
              }}
            >
              <Text style={{ fontFamily: tokens.fontSans, fontSize: 14, fontWeight: "600", color: on ? C.ink : "rgba(255,255,255,0.9)" }}>
                {slot.label}
              </Text>
              <Text style={{ marginTop: 4, fontFamily: HEADING, fontSize: 22, color: on ? C.ink : "#ffffff" }}>
                {formatTime(slot.localTime ?? "")}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={{ marginTop: 22, fontFamily: tokens.fontSans, fontSize: 13, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: "rgba(255,255,255,0.88)" }}>
        What it looks like
      </Text>
      <View
        style={{
          marginTop: 8,
          backgroundColor: "rgba(255,255,255,0.94)",
          borderRadius: 20,
          padding: 12,
          flexDirection: "row",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <LinearGradient colors={["#ffa47e", "#e06b46"]} style={{ width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="pulse" size={20} color="#ffffff" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontFamily: tokens.fontSans, fontSize: 14, fontWeight: "700", color: tokens.text }}>{preview.title}</Text>
            <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, color: tokens.textTer }}>{previewTime}</Text>
          </View>
          <Text style={{ marginTop: 2, fontFamily: tokens.fontSans, fontSize: 14, lineHeight: 19, color: tokens.textSec }}>{preview.body}</Text>
        </View>
      </View>
    </StepBody>
  );
}

// ── First habit (only when habits are enabled) ───────────────────────────

const REFLECTION_CHIP = "Daily reflection with Ripple";

function HabitStep({
  tokens,
  step,
  analyzing,
  onNext,
}: {
  tokens: Tokens;
  step: { n: number; of: number } | null;
  analyzing: boolean;
  onNext: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(REFLECTION_CHIP);
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
          <PrimaryButton label="Add this habit" tokens={tokens} onPress={onAdd} disabled={!habitName} busy={busy} />
          <TextLink label="Skip for now" tokens={tokens} onPress={onNext} />
        </>
      }
    >
      {analyzing ? <AnalyzingPill tokens={tokens} /> : null}
      <Eyebrow text={stepLabel(step)} tokens={tokens} />
      <Title>Pick a first habit</Title>
      <Lead tokens={tokens}>Mention it in a debrief and Ripple checks it off for you.</Lead>
      <Card style={{ marginTop: 20, paddingVertical: 6 }}>
        {chips.map((c, i) => {
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
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingVertical: 13,
                borderBottomWidth: i === chips.length - 1 ? 0 : StyleSheet.hairlineWidth,
                borderBottomColor: tokens.lineStrong,
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: 2,
                  borderColor: on ? C.ink : tokens.bgInsetStrong,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.ink }} /> : null}
              </View>
              <Text style={{ flex: 1, fontFamily: tokens.fontSans, fontSize: 16, fontWeight: on ? "700" : "500", color: tokens.text }}>{c}</Text>
            </Pressable>
          );
        })}
        <TextInput
          value={custom}
          onChangeText={setCustom}
          placeholder="Or type your own"
          placeholderTextColor={tokens.textQuiet}
          maxLength={80}
          returnKeyType="done"
          style={{ marginTop: 4, marginBottom: 8, fontFamily: tokens.fontSans, fontSize: 16, color: tokens.text, paddingVertical: 8 }}
        />
      </Card>
    </StepBody>
  );
}
