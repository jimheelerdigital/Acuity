import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Stack } from "expo-router";
import { Bell, CalendarCheck, ChevronRight, CircleCheck, Sparkles } from "lucide-react-native";
import type { PurchasesPackage } from "react-native-purchases";

import { useAuth } from "@/contexts/auth-context";
import { DEFAULT_PRICING_CONFIG } from "@acuity/shared";
import { isNewPricingEnabled } from "@/lib/feature-flags";
import { trackV10 } from "@/lib/onboarding-v10/analytics";
import { setV10PlanDecision } from "@/lib/onboarding-v10/state";
import { loadAnswers } from "@/lib/onboarding-v11/answers";
import { FAQ, PRO_FEATURES, REVIEWS, stateName } from "@/lib/onboarding-v11/copy";
import { finishOnboarding } from "@/lib/onboarding-v11/finish";
import {
  getProOffering,
  hasProEntitlement,
  purchaseProPackage,
  restoreProPurchases,
  type RcOfferingPackages,
} from "@/lib/revenuecat";

import { Card, GradientDot, IconTile, LightScreen, PrimaryButton, ReviewCard, Stars, V11 } from "../_v11/ui";

/**
 * Paywall — Keenan's design from the Miro board (2026-10-15), built
 * natively (Jimmy: "Native screen, RC sells it"). RevenueCat still owns
 * everything that matters commercially: the offering, the packages, the
 * store-localized prices, the purchase, restore and the entitlement. Only
 * the layout lives here.
 *
 * Trial REQUIRED (Jimmy 2026-10-15): there is no free / close option. The
 * only ways forward are a purchase or a restore. Safety valve: if the store
 * can't return any plans at all (offline, StoreKit outage, a misconfigured
 * offering), she's shown "Try again" and, after a failed retry, a quiet
 * "Continue for now" — a hard paywall with a broken store would otherwise
 * trap every new user.
 *
 * Nothing invented: prices, the trial length and "save X%" are computed
 * from the store products. The trial copy only appears when the selected
 * package actually has a free introductory offer.
 */

type Plan = "annual" | "monthly";

interface PlanView {
  pkg: PurchasesPackage;
  priceString: string;
  perMonth: string;
  trialDays: number | null;
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function freeTrialDays(pkg: PurchasesPackage): number | null {
  const intro = pkg.product.introPrice;
  if (!intro || intro.price !== 0) return null;
  const n = intro.periodNumberOfUnits;
  switch (intro.periodUnit) {
    case "DAY":
      return n;
    case "WEEK":
      return n * 7;
    case "MONTH":
      return n * 30;
    default:
      return null;
  }
}

function toView(raw: unknown, months: number): PlanView | null {
  const pkg = raw as PurchasesPackage | null;
  if (!pkg?.product) return null;
  const p = pkg.product;
  return {
    pkg,
    priceString: p.priceString,
    perMonth: money(p.price / months, p.currencyCode),
    trialDays: freeTrialDays(pkg),
  };
}

export default function V10Paywall() {
  const { user, refresh } = useAuth();
  const userFirstName = user?.name?.trim().split(/\s+/)[0] || null;

  const [plan, setPlan] = useState<Plan>("annual");
  const [offering, setOffering] = useState<RcOfferingPackages | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "failed">("loading");
  const [loadFailures, setLoadFailures] = useState(0);
  const [busy, setBusy] = useState<"buy" | "restore" | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [persona, setPersona] = useState({ name: userFirstName ?? "", state: "The Planner" });

  const finish = useCallback(() => finishOnboarding({ firstName: userFirstName, refresh }), [userFirstName, refresh]);

  // Already Pro (restored on another device, a web subscriber who signed in
  // on the account step, a TestFlight re-run) → nothing to sell.
  useEffect(() => {
    const status = user?.subscriptionStatus;
    if (status === "PRO" || status === "TRIAL") {
      void finish();
      return;
    }
    void hasProEntitlement().then((pro) => {
      if (pro) void finish();
    });
  }, [user?.subscriptionStatus, finish]);

  useEffect(() => {
    void loadAnswers().then((a) =>
      setPersona({ name: a.firstName || userFirstName || "", state: stateName({ sound: a.sound, carrying: a.carrying }) })
    );
  }, [userFirstName]);

  const load = useCallback(async () => {
    setLoadState("loading");
    const o = await getProOffering(
      { paidSince: null },
      { ...DEFAULT_PRICING_CONFIG, newPricingEnabled: isNewPricingEnabled() }
    );
    if (o && (o.annual || o.monthly)) {
      setOffering(o);
      setLoadState("ready");
      if (!o.annual) setPlan("monthly");
    } else {
      setLoadFailures((n) => n + 1);
      setLoadState("failed");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const annual = useMemo(() => toView(offering?.annual, 12), [offering]);
  const monthly = useMemo(() => toView(offering?.monthly, 1), [offering]);
  const selected = plan === "annual" ? annual : monthly;

  const savePct = useMemo(() => {
    if (!annual || !monthly) return null;
    const a = annual.pkg.product.price;
    const m = monthly.pkg.product.price * 12;
    if (!(m > 0) || a >= m) return null;
    return Math.round((1 - a / m) * 100);
  }, [annual, monthly]);

  useEffect(() => {
    if (loadState !== "ready") return;
    trackV10("v10_paywall_viewed", { selected_plan: plan, variant: "native_v11", hard: true });
    // Once per load, not per toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadState]);

  const pick = (p: Plan) => {
    setPlan(p);
    trackV10("v10_plan_toggled", { plan: p });
  };

  const onBuy = async () => {
    if (!selected || busy) return;
    setBusy("buy");
    try {
      const result = await purchaseProPackage(selected.pkg);
      if (result.status === "cancelled") return;
      if (result.status === "success") {
        trackV10("v10_plan_decision", { decision: plan });
        await setV10PlanDecision(plan);
        await finish();
        return;
      }
      Alert.alert(
        "Purchase didn't go through",
        result.status === "error" ? result.message : "Purchases are unavailable right now. Please try again."
      );
    } finally {
      setBusy(null);
    }
  };

  const onRestore = async () => {
    if (busy) return;
    setBusy("restore");
    trackV10("v10_plan_decision", { decision: "restore_attempted" });
    try {
      const pro = await restoreProPurchases();
      if (pro) {
        await finish();
        return;
      }
      Alert.alert("No purchases to restore", "We didn't find a Ripple Pro subscription on this Apple ID.");
    } finally {
      setBusy(null);
    }
  };

  const trialDays = selected?.trialDays ?? null;
  const name = persona.name;

  if (loadState !== "ready") {
    return (
      <LightScreen>
        <Stack.Screen options={{ gestureEnabled: false }} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          {loadState === "loading" ? (
            <ActivityIndicator color={V11.coral} />
          ) : (
            <Animated.View entering={FadeIn.duration(250)} style={{ alignItems: "center", gap: 12, alignSelf: "stretch" }}>
              <Text style={{ textAlign: "center", fontFamily: V11.heading, fontSize: 22, color: V11.ink }}>
                Couldn't load the plans
              </Text>
              <Text style={{ textAlign: "center", fontSize: 15, lineHeight: 22, color: V11.sec }}>
                Check your connection and try again.
              </Text>
              <View style={{ alignSelf: "stretch", marginTop: 8 }}>
                <PrimaryButton label="Try again" icon="none" onPress={() => void load()} />
              </View>
              {loadFailures >= 2 ? (
                <Pressable
                  onPress={() => {
                    trackV10("v10_plan_decision", { decision: "store_unavailable_continue" });
                    void finish();
                  }}
                  style={{ paddingVertical: 10 }}
                >
                  <Text style={{ fontSize: 14, color: V11.ter }}>Continue for now</Text>
                </Pressable>
              ) : null}
            </Animated.View>
          )}
        </View>
      </LightScreen>
    );
  }

  const ctaLabel = trialDays ? `Start my ${trialDays}-day free trial` : "Start Ripple Pro";
  const after = selected
    ? plan === "annual"
      ? `${selected.priceString}/year`
      : `${selected.priceString}/month`
    : "";

  return (
    <LightScreen>
      {/* Trial required: no swipe-back past the paywall either. */}
      <Stack.Screen options={{ gestureEnabled: false }} />
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
          {/* Badge */}
          <Animated.View entering={FadeInDown.duration(380)} style={{ alignItems: "center", marginBottom: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fff", borderRadius: 999, borderWidth: 1, borderColor: V11.lineStrong, paddingHorizontal: 12, paddingVertical: 6 }}>
              <CircleCheck size={14} color={V11.good} />
              <Text style={{ fontSize: 13, fontWeight: "700", color: V11.ink }}>
                Your plan is ready{name ? `, ${name}` : ""}
              </Text>
            </View>
          </Animated.View>

          {/* Title */}
          <Text accessibilityRole="header" style={{ textAlign: "center", fontFamily: V11.heading, fontSize: 28, lineHeight: 33, letterSpacing: -0.6, color: V11.ink }}>
            {trialDays ? (
              <>
                Try Ripple Pro <Text style={{ color: V11.coral }}>free for {trialDays} days</Text>
              </>
            ) : (
              "Unlock Ripple Pro"
            )}
          </Text>
          <Text style={{ textAlign: "center", marginTop: 8, fontSize: 15, color: V11.sec }}>
            Made for <Text style={{ fontWeight: "700", color: V11.ink }}>{persona.state}</Text>.
            {trialDays ? " $0 today, cancel any time." : " Cancel any time."}
          </Text>

          {/* Plans */}
          <View style={{ marginTop: 22, gap: 12 }}>
            {annual ? (
              <PlanCard
                selected={plan === "annual"}
                onPress={() => pick("annual")}
                title="Yearly"
                sub={annual.trialDays ? `${annual.priceString} a year after your free ${annual.trialDays === 7 ? "week" : "trial"}` : `${annual.priceString} billed yearly`}
                big={annual.perMonth}
                badge={savePct ? `BEST VALUE · SAVE ${savePct}%` : "BEST VALUE"}
              />
            ) : null}
            {monthly ? (
              <PlanCard
                selected={plan === "monthly"}
                onPress={() => pick("monthly")}
                title="Monthly"
                sub={monthly.trialDays ? `Billed monthly after your free ${monthly.trialDays === 7 ? "week" : "trial"}` : "Billed monthly"}
                big={monthly.priceString}
              />
            ) : null}
          </View>

          {/* Timeline — only when this plan has a free trial */}
          {trialDays ? (
            <Card style={{ marginTop: 16, paddingHorizontal: 14, paddingVertical: 18 }}>
              <View style={{ flexDirection: "row" }}>
                <View style={{ position: "absolute", left: "16.6%", right: "16.6%", top: 19, height: 2, backgroundColor: V11.line }} />
                <View style={{ position: "absolute", left: "16.6%", width: "33.4%", top: 19, height: 2, backgroundColor: V11.coral }} />
                {[
                  { label: "Today", text: "Full access. $0.", icon: "sparkles" as const },
                  { label: `Day ${Math.max(1, trialDays - 2)}`, text: "Cancel any time", icon: "bell" as const },
                  { label: `Day ${trialDays}`, text: "Plan starts", icon: "calendar" as const },
                ].map((t, i) => (
                  <View key={t.label} style={{ flex: 1, alignItems: "center" }}>
                    {i === 0 ? (
                      <GradientDot size={40}>
                        <Sparkles size={18} color="#fff" />
                      </GradientDot>
                    ) : (
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#fff", borderWidth: 1, borderColor: V11.lineStrong, alignItems: "center", justifyContent: "center" }}>
                        {t.icon === "bell" ? <Bell size={18} color={V11.coral} /> : <CalendarCheck size={18} color={V11.coral} />}
                      </View>
                    )}
                    <Text style={{ marginTop: 8, fontSize: 13, fontWeight: "800", color: V11.ink }}>{t.label}</Text>
                    <Text style={{ fontSize: 12, color: V11.sec, textAlign: "center" }}>{t.text}</Text>
                  </View>
                ))}
              </View>
              <Text style={{ marginTop: 14, textAlign: "center", fontSize: 13, color: V11.sec }}>
                Cancel before day {trialDays} and you pay nothing.
              </Text>
            </Card>
          ) : null}

          {/* What Pro gives you */}
          <Card style={{ marginTop: 16, padding: 18, gap: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: "800", color: V11.ink }}>What Pro gives you</Text>
            {PRO_FEATURES.map((f) => (
              <View key={f.title} style={{ flexDirection: "row", gap: 12 }}>
                <IconTile name={f.icon} on={false} size={38} radius={11} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: V11.display, fontSize: 15, color: V11.ink }}>{f.title}</Text>
                  <Text style={{ marginTop: 1, fontSize: 13, lineHeight: 18, color: V11.sec }}>{f.text}</Text>
                </View>
              </View>
            ))}
          </Card>

          {/* Reviews */}
          <View style={{ marginTop: 22 }}>
            <Stars label="on the App Store" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={292}
              decelerationRate="fast"
              style={{ marginTop: 12, marginHorizontal: -20 }}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
            >
              {REVIEWS.map((r) => (
                <ReviewCard key={r.name} quote={r.quote} name={r.name} style={{ width: 280 }} />
              ))}
            </ScrollView>
          </View>

          {/* FAQ */}
          <Card style={{ marginTop: 22, paddingHorizontal: 18, paddingVertical: 4 }}>
            {FAQ.map((f, i) => (
              <View key={f.q} style={{ borderBottomWidth: i < FAQ.length - 1 ? 1 : 0, borderBottomColor: V11.line }}>
                <Pressable
                  onPress={() => setOpenFaq(openFaq === i ? null : i)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: openFaq === i }}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 15, gap: 12 }}
                >
                  <Text style={{ flex: 1, fontFamily: V11.display, fontSize: 15, color: V11.ink }}>{f.q}</Text>
                  <View style={{ transform: [{ rotate: openFaq === i ? "90deg" : "0deg" }] }}>
                    <ChevronRight size={18} color={V11.ter} />
                  </View>
                </Pressable>
                {openFaq === i ? (
                  <Animated.Text entering={FadeIn.duration(200)} style={{ paddingBottom: 14, fontSize: 14, lineHeight: 21, color: V11.sec }}>
                    {f.a}
                  </Animated.Text>
                ) : null}
              </View>
            ))}
          </Card>

          <Text style={{ marginTop: 20, textAlign: "center", fontSize: 11, color: V11.quiet }}>
            If you're in crisis, call or text 988 (Suicide & Crisis Lifeline).
          </Text>
        </ScrollView>

        {/* Bottom bar */}
        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, borderTopWidth: 1, borderTopColor: V11.line, backgroundColor: "rgba(246,245,249,0.95)" }}>
          <PrimaryButton label={ctaLabel} busy={busy === "buy"} disabled={!selected || busy !== null} onPress={() => void onBuy()} />
          <Text style={{ marginTop: 8, textAlign: "center", fontSize: 12, color: V11.sec }}>
            {trialDays ? (
              <>
                <Text style={{ fontWeight: "700", color: V11.ink }}>$0 today.</Text> Then {after}, renews automatically. Cancel any time.
              </>
            ) : (
              <>{after}, renews automatically. Cancel any time in Settings.</>
            )}
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 14, marginTop: 6 }}>
            <FooterLink label={busy === "restore" ? "Restoring…" : "Restore purchases"} onPress={() => void onRestore()} />
            <FooterLink label="Terms" onPress={() => void Linking.openURL("https://goripple.io/terms")} />
            <FooterLink label="Privacy" onPress={() => void Linking.openURL("https://goripple.io/privacy")} />
          </View>
        </View>
      </View>
    </LightScreen>
  );
}

function PlanCard({
  selected,
  onPress,
  title,
  sub,
  big,
  badge,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  sub: string;
  big: string;
  badge?: string;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }}>
      <Card selected={selected} style={{ paddingHorizontal: 18, paddingTop: badge ? 20 : 16, paddingBottom: 16 }}>
        {badge ? (
          <View style={{ position: "absolute", top: -11, left: 18 }}>
            <View style={{ borderRadius: 999, overflow: "hidden" }}>
              <GradientPill text={badge} />
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              borderWidth: 2,
              borderColor: selected ? V11.coral : V11.quiet,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {selected ? <GradientDot size={11} /> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: V11.display, fontSize: 17, color: V11.ink }}>{title}</Text>
            <Text style={{ marginTop: 2, fontSize: 13, color: V11.sec }}>{sub}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontFamily: V11.heading, fontSize: 24, letterSpacing: -0.5, color: V11.ink }}>{big}</Text>
            <Text style={{ fontSize: 12, color: V11.ter }}>per month</Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

function GradientPill({ text }: { text: string }) {
  return (
    <View style={{ backgroundColor: V11.coral, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 }}>
      <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.4, color: "#fff" }}>{text}</Text>
    </View>
  );
}

function FooterLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6}>
      <Text style={{ fontSize: 12, color: V11.ter }}>{label}</Text>
    </Pressable>
  );
}
