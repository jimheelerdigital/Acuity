import { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { useTheme } from "@/contexts/theme-context";
import { makeAcuityTokens } from "@/lib/theme/tokens";
import { trackV10 } from "@/lib/onboarding-v10/analytics";
import {
  getV10Branch,
  setV10PlanDecision,
} from "@/lib/onboarding-v10/state";
import {
  ANCHOR_OPTION,
  COMPARISON_ROWS,
  buildPaywallCopy,
  type PlanCopy,
} from "@/lib/onboarding-v10/paywall-config";
import { V10_BRANCHES, type V10Branch } from "@/lib/onboarding-v10/branches";
import { getStoredTryExtraction } from "@/lib/try-session";
import { LEGACY_TIER, V2_TIER } from "@acuity/shared";
import { isNewPricingEnabled } from "@/lib/feature-flags";

/**
 * Screen 6 — Paywall (light, single screen).
 *
 * ── Position is the design ───────────────────────────────────────────
 * This comes immediately after the reveal and BEFORE any account step.
 * Spec §1: "No account or paywall before the first recording and reveal."
 * The user has already heard themselves reflected back; the ask lands
 * against something they've experienced rather than something promised.
 *
 * ── Soft paywall ─────────────────────────────────────────────────────
 * "Continue with Free" is visible but low-emphasis (Z7). It is a real exit,
 * not a dark pattern — hard-vs-visible-free is A/B test #3, and shipping a
 * hidden escape would poison that baseline.
 *
 * ── Nothing here is invented ─────────────────────────────────────────
 * The personalized header (Z1) renders ONLY counts that came from the
 * extraction. If the debrief produced no tasks, the header says so rather
 * than rounding up to a number that sounds better.
 *
 * ── Prices come from config, never from JSX ──────────────────────────
 * Every price string is built by buildPaywallCopy() from the resolved
 * PricingTier. See paywall-config.ts for why, and for the anchor A/B
 * toggle that spec §10 leaves as Keenan's open decision.
 *
 * ⚠️ PURCHASE IS NOT WIRED IN THIS SLICE. The CTA records the decision and
 * advances. Native purchase on the anonymous RevenueCat identity is the
 * next slice — see onPurchase() below for exactly what it must do and why
 * it cannot be faked in the meantime.
 */

type Plan = "annual" | "monthly";

export default function V10Paywall() {
  // Screen 6 is a LIGHT screen (spec §1: screens 3+ are light), so tokens
  // are built with dark:false regardless of the user's theme preference —
  // same as every other v10 screen from Screen 3 onward.
  const { palette } = useTheme();
  const tokens = useMemo(
    () => makeAcuityTokens({ dark: false, accent: palette }),
    [palette]
  );

  // Spec §4 Screen 6: "ANNUAL PRE-SELECTED."
  const [plan, setPlan] = useState<Plan>("annual");
  const [branch, setBranch] = useState<V10Branch | null>(null);
  const [taskCount, setTaskCount] = useState<number | null>(null);

  const tier = isNewPricingEnabled() ? V2_TIER : LEGACY_TIER;
  const copy = useMemo(() => buildPaywallCopy(tier), [tier]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [b, extraction] = await Promise.all([
        getV10Branch(),
        getStoredTryExtraction(),
      ]);
      if (cancelled) return;
      setBranch(b);

      // Real count or nothing. An absent extraction means we render the
      // unpersonalized header rather than a plausible-looking zero.
      const tasks = extraction?.tasks;
      setTaskCount(Array.isArray(tasks) ? tasks.length : null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    trackV10("v10_paywall_viewed", {
      branch,
      selected_plan: plan,
      variant: ANCHOR_OPTION,
    });
    // Fires once per mount, not per toggle — the toggle has its own event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch]);

  const selectPlan = useCallback((next: Plan) => {
    setPlan(next);
    trackV10("v10_plan_toggled", { plan: next });
  }, []);

  const onPurchase = useCallback(() => {
    // ── NOT YET IMPLEMENTED — deliberately not stubbed as success ─────
    //
    // The real implementation must, in this order:
    //   1. purchaseProduct() against the platform product id for `plan`
    //      on the ANONYMOUS RevenueCat identity (no account exists yet).
    //   2. Let the entitlement land on that anonymous id.
    //   3. On the later account step, Purchases.logIn(user.id) aliases the
    //      anonymous id — this is what makes purchase-before-account
    //      idempotent, and it is already wired in auth-context.tsx.
    //
    // Faking a success here would hand someone a paid experience they were
    // never charged for and produce a purchase event with no receipt behind
    // it, which is worse than an honest "not ready".
    trackV10("v10_plan_decision", { decision: plan });
    void setV10PlanDecision(plan);
    router.push("/onboarding-new/account");
  }, [plan]);

  const onContinueFree = useCallback(() => {
    trackV10("v10_plan_decision", { decision: "free" });
    void setV10PlanDecision("free");
    router.push("/onboarding-new/account");
  }, []);

  const cta = copy.cta(plan);
  const timeline = copy.timeline(plan);
  const selected = plan === "annual" ? copy.annual : copy.monthly;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 24,
          paddingBottom: 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Z1 personalized header ─────────────────────────────── */}
        <Text
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 26,
            lineHeight: 32,
            color: tokens.text,
            marginBottom: 8,
          }}
        >
          {headerFor(taskCount)}
        </Text>
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontStyle: "italic",
            fontSize: 15,
            lineHeight: 22,
            color: tokens.textSec,
            marginBottom: 24,
          }}
        >
          {branch ? V10_BRANCHES[branch].paywallObservation : DEFAULT_OBSERVATION}
        </Text>

        {/* ── Z2 honest timeline ─────────────────────────────────── */}
        <View style={{ gap: 6, marginBottom: 24 }}>
          {timeline.map((line) => (
            <Text
              key={line}
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 14,
                lineHeight: 20,
                color: tokens.textSec,
              }}
            >
              {line}
            </Text>
          ))}
        </View>

        {/* ── Z3 plans — annual pre-selected ─────────────────────── */}
        <View style={{ gap: 10, marginBottom: 20 }}>
          <PlanCard
            copy={copy.annual}
            selected={plan === "annual"}
            onPress={() => selectPlan("annual")}
            tokens={tokens}
          />
          <PlanCard
            copy={copy.monthly}
            selected={plan === "monthly"}
            onPress={() => selectPlan("monthly")}
            tokens={tokens}
          />
        </View>

        {/* ── Z4 Free vs Ripple ──────────────────────────────────── */}
        <View
          style={{
            borderWidth: 1,
            borderColor: tokens.line,
            borderRadius: 14,
            paddingVertical: 12,
            paddingHorizontal: 16,
            marginBottom: 20,
          }}
        >
          <View style={{ flexDirection: "row", marginBottom: 8 }}>
            <Text style={{ flex: 1 }} />
            <ColHead label="Free" tokens={tokens} />
            <ColHead label="Ripple" tokens={tokens} />
          </View>
          {COMPARISON_ROWS.map((row) => (
            <View
              key={row.label}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 6,
              }}
            >
              <Text
                style={{
                  flex: 1,
                  fontFamily: tokens.fontSans,
                  fontSize: 14,
                  color: tokens.text,
                }}
              >
                {row.label}
              </Text>
              <Mark on={row.free} tokens={tokens} />
              <Mark on={row.pro} tokens={tokens} />
            </View>
          ))}
        </View>

        {/* ── Z6 CTA ─────────────────────────────────────────────── */}
        <Pressable
          onPress={onPurchase}
          accessibilityRole="button"
          accessibilityLabel={cta.label}
          style={({ pressed }) => ({
            backgroundColor: tokens.primary,
            borderRadius: 999,
            paddingVertical: 18,
            alignItems: "center",
            transform: [{ scale: pressed ? 0.99 : 1 }],
          })}
        >
          <Text
            style={{
              fontFamily: tokens.fontDisplay,
              fontSize: 17,
              color: "#ffffff",
            }}
          >
            {cta.label}
          </Text>
        </Pressable>
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 12,
            lineHeight: 18,
            color: tokens.textTer,
            textAlign: "center",
            marginTop: 10,
          }}
        >
          {cta.finePrint}
        </Text>

        {/* ── Z7 low-emphasis free exit ──────────────────────────── */}
        <Pressable
          onPress={onContinueFree}
          accessibilityRole="button"
          style={{ paddingVertical: 16, alignItems: "center" }}
        >
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 14,
              color: tokens.textTer,
              textDecorationLine: "underline",
            }}
          >
            Continue with Free
          </Text>
        </Pressable>

        {/* ── Z8 required footer ─────────────────────────────────── */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          <FooterLink label="Restore Purchases" onPress={onRestore} tokens={tokens} />
          <Dot tokens={tokens} />
          <FooterLink
            label="Terms"
            onPress={() => void Linking.openURL("https://goripple.io/terms")}
            tokens={tokens}
          />
          <Dot tokens={tokens} />
          <FooterLink
            label="Privacy"
            onPress={() => void Linking.openURL("https://goripple.io/privacy")}
            tokens={tokens}
          />
        </View>

        {/* Selected-plan id kept visible to the accessibility tree only —
            useful for automated acceptance runs, invisible to users. */}
        <Text
          accessibilityElementsHidden={false}
          importantForAccessibility="no-hide-descendants"
          style={{ height: 0, opacity: 0 }}
        >
          {selected.productId.apple}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Z1 header. Real counts only.
 *
 * `null` means we never got an extraction back — not that there were zero
 * tasks. Those are different facts and the copy must not conflate them.
 */
function headerFor(taskCount: number | null): string {
  if (taskCount === null) return "That was one debrief.";
  if (taskCount === 0) {
    return "That was one debrief. Ripple was listening.";
  }
  if (taskCount === 1) return "One debrief. One thing to carry forward.";
  return `One debrief. ${taskCount} things to carry forward.`;
}

const DEFAULT_OBSERVATION =
  "One debrief is a snapshot. The next one is where Ripple starts comparing.";

// ─── Small presentational pieces ────────────────────────────────────

type Tokens = ReturnType<typeof makeAcuityTokens>;

function PlanCard({
  copy,
  selected,
  onPress,
  tokens,
}: {
  copy: PlanCopy;
  selected: boolean;
  onPress: () => void;
  tokens: Tokens;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={{
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? tokens.primary : tokens.line,
        borderRadius: 14,
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: selected ? tokens.bgInset : "transparent",
      }}
    >
      <Text
        style={{
          fontFamily: tokens.fontSans,
          fontSize: 11,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: tokens.textTer,
          marginBottom: 4,
        }}
      >
        {copy.eyebrow}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        {copy.strikeThrough ? (
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 14,
              color: tokens.textTer,
              textDecorationLine: "line-through",
            }}
          >
            {copy.strikeThrough}
          </Text>
        ) : null}
        <Text
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 20,
            color: tokens.text,
          }}
        >
          {copy.price}
        </Text>
        {copy.subPrice ? (
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 14,
              color: tokens.textSec,
            }}
          >
            {copy.subPrice}
          </Text>
        ) : null}
      </View>
      <Text
        style={{
          fontFamily: tokens.fontSans,
          fontSize: 13,
          color: tokens.textSec,
          marginTop: 2,
        }}
      >
        {copy.note}
      </Text>
    </Pressable>
  );
}

function ColHead({ label, tokens }: { label: string; tokens: Tokens }) {
  return (
    <Text
      style={{
        width: 56,
        textAlign: "center",
        fontFamily: tokens.fontSans,
        fontSize: 11,
        letterSpacing: 0.8,
        textTransform: "uppercase",
        color: tokens.textTer,
      }}
    >
      {label}
    </Text>
  );
}

function Mark({ on, tokens }: { on: boolean; tokens: Tokens }) {
  return (
    <Text
      accessibilityLabel={on ? "included" : "not included"}
      style={{
        width: 56,
        textAlign: "center",
        fontFamily: tokens.fontSans,
        fontSize: 15,
        color: on ? tokens.text : tokens.textTer,
      }}
    >
      {on ? "✓" : "—"}
    </Text>
  );
}

function FooterLink({
  label,
  onPress,
  tokens,
}: {
  label: string;
  onPress: () => void;
  tokens: Tokens;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8}>
      <Text
        style={{
          fontFamily: tokens.fontSans,
          fontSize: 12,
          color: tokens.textTer,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Dot({ tokens }: { tokens: Tokens }) {
  return (
    <Text style={{ fontSize: 12, color: tokens.textTer }} accessibilityElementsHidden>
      ·
    </Text>
  );
}

/**
 * Restore is required by App Review on any screen selling a subscription,
 * and it must work BEFORE an account exists — a user reinstalling has an
 * entitlement on their store account and no Ripple session yet.
 *
 * Wired in the purchase slice alongside onPurchase().
 */
function onRestore() {
  trackV10("v10_plan_decision", { decision: "restore_attempted" });
}
