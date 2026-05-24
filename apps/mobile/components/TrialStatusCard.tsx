import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { GradientText } from "@/components/acuity";
import { useTheme } from "@/contexts/theme-context";

/**
 * TrialStatusCard — mobile parity for the web /account TrialStatusCard
 * (apps/web/src/app/account/_components/trial-status-card.tsx).
 *
 * Four visual states based on (subscriptionStatus, daysRemaining):
 *
 *   1. TRIAL with daysRemaining > 7  — plain "N days left"
 *   2. TRIAL with daysRemaining 4-7  — gradMix-tinted count
 *   3. TRIAL with daysRemaining 1-3  — bad-tinted count + Continue-on-web CTA
 *   4. FREE with recent trialExpiredAt — "Your insights are paused" + CTA
 *
 * Re-computes daysRemaining on a 1-minute interval so a user leaving
 * the Profile tab open across the trial-end boundary sees the count
 * tick (and eventually the FREE-post copy after the server's cron
 * flips them).
 *
 * Apple Option-C compliance: the CTA is a Safari deep-link to the
 * web upgrade page (3.1.3(b) Multiplatform Service). No prices, no
 * "Subscribe" copy in-app. Matches the existing "Manage plan on web"
 * pattern in profile.tsx.
 */

export interface TrialStatusCardProps {
  subscriptionStatus: string;
  trialEndsAt: string | null;
  trialExpiredAt: string | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const POST_EXPIRY_BANNER_DAYS = 14;

function apiBaseUrl(): string {
  const extra = Constants.expoConfig?.extra as
    | { apiUrl?: string }
    | undefined;
  return (
    process.env.EXPO_PUBLIC_API_URL ??
    extra?.apiUrl ??
    "https://getacuity.io"
  );
}

function openContinueOnWeb() {
  const url = `${apiBaseUrl()}/upgrade?src=mobile_trial_card`;
  void Linking.openURL(url);
}

function daysFromMs(ms: number): number {
  return Math.max(0, Math.ceil(ms / MS_PER_DAY));
}

export function TrialStatusCard({
  subscriptionStatus,
  trialEndsAt,
  trialExpiredAt,
}: TrialStatusCardProps) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (subscriptionStatus === "FREE" && trialExpiredAt) {
    const expiredAt = new Date(trialExpiredAt).getTime();
    const daysSinceExpiry = (now - expiredAt) / MS_PER_DAY;
    if (daysSinceExpiry >= 0 && daysSinceExpiry <= POST_EXPIRY_BANNER_DAYS) {
      return <PostExpiryCard />;
    }
    return null;
  }

  if (subscriptionStatus !== "TRIAL" || !trialEndsAt) return null;

  const endMs = new Date(trialEndsAt).getTime();
  const remainingMs = endMs - now;
  const daysRemaining = daysFromMs(remainingMs);

  if (daysRemaining <= 0) return <PostExpiryCard />;
  if (daysRemaining <= 3) return <UrgentTrialCard daysRemaining={daysRemaining} />;
  if (daysRemaining <= 7) return <MidTrialCard daysRemaining={daysRemaining} />;
  return <StandardTrialCard daysRemaining={daysRemaining} />;
}

function CardShell({ children }: { children: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <View
      style={{
        borderRadius: tokens.radius.xl,
        backgroundColor: tokens.cardBg,
        borderWidth: 0.5,
        borderColor: tokens.cardBorder,
        padding: 20,
        marginBottom: 16,
      }}
    >
      {children}
    </View>
  );
}

function Eyebrow({ label }: { label: string }) {
  const { tokens } = useTheme();
  return (
    <Text
      style={{
        fontFamily: tokens.fontMono,
        fontSize: 10,
        fontWeight: "700",
        letterSpacing: 1.4,
        color: tokens.textTer,
        textTransform: "uppercase",
      }}
    >
      {label}
    </Text>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <Text
      style={{
        fontFamily: tokens.fontSans,
        fontSize: 14,
        lineHeight: 21,
        color: tokens.textSec,
        marginTop: 10,
      }}
    >
      {children}
    </Text>
  );
}

function ContinueOnWebButton() {
  const { tokens } = useTheme();
  return (
    <View style={{ marginTop: 16 }}>
      <Pressable
        onPress={openContinueOnWeb}
        style={{
          alignSelf: "flex-start",
          borderRadius: tokens.radius.pill,
          backgroundColor: tokens.cardBgTint,
          borderWidth: 0.5,
          borderColor: tokens.cardBorder,
          paddingHorizontal: 16,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 14,
            fontWeight: "600",
            color: tokens.text,
          }}
        >
          Continue on web
        </Text>
        <Text style={{ fontSize: 14, color: tokens.text }}>→</Text>
      </Pressable>
    </View>
  );
}

function StandardTrialCard({ daysRemaining }: { daysRemaining: number }) {
  const { tokens } = useTheme();
  const label = daysRemaining === 1 ? "day" : "days";
  return (
    <CardShell>
      <Eyebrow label="Trial" />
      <Text
        style={{
          fontFamily: tokens.fontDisplay,
          fontSize: 32,
          fontWeight: "700",
          color: tokens.text,
          marginTop: 10,
          fontVariant: ["tabular-nums"],
        }}
      >
        {daysRemaining} {label} left
      </Text>
      <Body>
        After your trial, recording stays yours. Life Matrix, Theme Map,
        and weekly insights move to Pro.
      </Body>
    </CardShell>
  );
}

function MidTrialCard({ daysRemaining }: { daysRemaining: number }) {
  const { tokens } = useTheme();
  const label = daysRemaining === 1 ? "day" : "days";
  return (
    <CardShell>
      <Eyebrow label="Trial" />
      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          marginTop: 10,
          flexWrap: "wrap",
        }}
      >
        <GradientText
          colors={tokens.gradMix.colors as unknown as readonly [string, string, ...string[]]}
          start={tokens.gradMix.start}
          end={tokens.gradMix.end}
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 32,
            fontWeight: "700",
            fontVariant: ["tabular-nums"],
          }}
        >
          {daysRemaining} {label}
        </GradientText>
        <Text
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 32,
            fontWeight: "700",
            color: tokens.text,
          }}
        >
          {" left"}
        </Text>
      </View>
      <Body>
        After your trial, recording stays yours. Life Matrix, Theme Map,
        and weekly insights move to Pro.
      </Body>
    </CardShell>
  );
}

function UrgentTrialCard({ daysRemaining }: { daysRemaining: number }) {
  const { tokens } = useTheme();
  const label = daysRemaining === 1 ? "day" : "days";
  return (
    <CardShell>
      <Eyebrow label="Trial" />
      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          marginTop: 10,
          flexWrap: "wrap",
        }}
      >
        <Text
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 32,
            fontWeight: "700",
            color: tokens.bad,
            fontVariant: ["tabular-nums"],
          }}
        >
          {daysRemaining} {label}
        </Text>
        <Text
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 32,
            fontWeight: "700",
            color: tokens.text,
          }}
        >
          {" left"}
        </Text>
      </View>
      <Body>
        After your trial ends, recording stays free. Life Matrix and
        Theme Map lock until you continue on web.
      </Body>
      <ContinueOnWebButton />
    </CardShell>
  );
}

function PostExpiryCard() {
  const { tokens } = useTheme();
  return (
    <CardShell>
      <Eyebrow label="Trial ended" />
      <Text
        style={{
          fontFamily: tokens.fontDisplay,
          fontSize: 28,
          fontWeight: "700",
          color: tokens.text,
          marginTop: 10,
        }}
      >
        Your insights are paused
      </Text>
      <Body>
        Recording stays yours. Your data is preserved. Life Matrix,
        Theme Map, and weekly insights are saved exactly where you
        left them — continue on web to bring them back.
      </Body>
      <ContinueOnWebButton />
    </CardShell>
  );
}
