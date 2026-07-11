import { Ionicons } from "@expo/vector-icons";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_GROUPS,
  NOTIFICATION_TONES,
  defaultNotificationPreferences,
  type NotificationCategory,
  type NotificationPreferences,
  type NotificationTone,
} from "@acuity/shared";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { StickyBackButton } from "@/components/back-button";
import {
  ReminderTimePicker,
  useLocalTimezoneLabel,
} from "@/components/reminders/time-picker";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import type { AcuityTokens } from "@/lib/theme/tokens";

/**
 * Mobile notification preferences (Slice: smart-notifications).
 *
 * Companion to /reminders — that screen schedules OS-local journaling
 * reminders; this screen controls the server-driven engagement
 * notifications (streaks, milestones, goal/task nudges, reflections).
 *
 * Data layer is shared + already deployed:
 *   GET  /api/account/notification-preferences -> { preferences }
 *   PUT  /api/account/notification-preferences  (partial) -> { ok, preferences }
 *
 * Saves are optimistic: we patch local state immediately, then PUT the
 * changed field(s). On failure we revert to the last server-confirmed
 * snapshot and surface an Alert — same forgiving pattern as /reminders.
 *
 * Email is the only channel in v1, so emailEnabled acts as a master
 * switch: when off, every other control is dimmed + non-interactive.
 *
 * Voice: mirror, not coach. No fixed-time language, no duration claims.
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatPausedUntil(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "soon";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function NotificationPreferencesScreen() {
  const { tokens } = useTheme();
  const tzLabel = useLocalTimezoneLabel();

  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<NotificationPreferences>(
    defaultNotificationPreferences()
  );

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ preferences: NotificationPreferences }>(
        "/api/account/notification-preferences"
      );
      if (res?.preferences) setPrefs(res.preferences);
    } catch {
      // silent — defaults already populated via useState
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Optimistic patch: apply locally, PUT the changed field(s), revert
  // to the prior snapshot on failure.
  const patch = useCallback(
    async (changed: Partial<NotificationPreferences>) => {
      const prev = prefs;
      const next = { ...prev, ...changed };
      setPrefs(next);
      try {
        const res = await api.put<{
          ok: true;
          preferences: NotificationPreferences;
        }>("/api/account/notification-preferences", changed);
        if (res?.preferences) setPrefs(res.preferences);
      } catch {
        setPrefs(prev);
        Alert.alert("Couldn't save", "Please try again.");
      }
    },
    [prefs]
  );

  const toggleCategory = (key: NotificationCategory) => {
    const on = prefs.enabledCategories.includes(key);
    const enabledCategories = on
      ? prefs.enabledCategories.filter((k) => k !== key)
      : [...prefs.enabledCategories, key];
    void patch({ enabledCategories });
  };

  const pauseSevenDays = () => {
    const until = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    void patch({ pausedUntil: until });
  };

  const resume = () => {
    void patch({ pausedUntil: null });
  };

  if (loading) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: tokens.bg }}
      >
        <ActivityIndicator color={tokens.primary} />
      </SafeAreaView>
    );
  }

  const channelOn = prefs.emailEnabled;
  const dim = channelOn ? 1 : 0.4;

  return (
    <SafeAreaView
      edges={["top"]}
      className="flex-1"
      style={{ backgroundColor: tokens.bg }}
    >
      <StickyBackButton accessibilityLabel="Back to Profile" />
      <ScrollView
        contentContainerStyle={{
          paddingTop: 80,
          paddingBottom: 40,
          paddingHorizontal: 24,
        }}
      >
        <Text
          style={{
            color: tokens.text,
            fontSize: 34,
            fontWeight: "700",
            letterSpacing: -0.6,
          }}
        >
          Notifications
        </Text>
        <Text
          style={{
            color: tokens.textTer,
            fontSize: 17,
            marginTop: 6,
            lineHeight: 24,
          }}
        >
          What Ripple reaches out about, and how.
        </Text>

        {/* Master channel — email is the only channel in v1. */}
        <SwitchRow
          tokens={tokens}
          label="Email notifications"
          description="The only way we reach out for now."
          value={prefs.emailEnabled}
          onToggle={() => void patch({ emailEnabled: !prefs.emailEnabled })}
          style={{ marginTop: 28 }}
        />

        {/* Everything below is gated on the channel being on. */}
        <View
          style={{ opacity: dim }}
          pointerEvents={channelOn ? "auto" : "none"}
        >
          {/* Sections + headings come from @acuity/shared so the privacy
              rule (the opt-in group's heading) stays identical to web. */}
          {NOTIFICATION_GROUPS.map((g) => (
            <View key={g.key}>
              <SectionHeader tokens={tokens} title={g.heading} />
              <Text
                style={{
                  color: tokens.textQuiet,
                  fontSize: 13,
                  lineHeight: 19,
                  marginBottom: 12,
                }}
              >
                {g.subheading}
              </Text>
              <View style={{ gap: 8 }}>
                {NOTIFICATION_CATEGORIES.filter((c) => c.group === g.key).map(
                  (c) => (
                    <SwitchRow
                      key={c.key}
                      tokens={tokens}
                      label={c.label}
                      description={c.description}
                      value={prefs.enabledCategories.includes(c.key)}
                      onToggle={() => toggleCategory(c.key)}
                    />
                  )
                )}
              </View>
            </View>
          ))}

          {/* Tone — voice of the copy the engine generates. */}
          <SectionHeader tokens={tokens} title="Tone" />
          <View style={{ gap: 8 }}>
            {NOTIFICATION_TONES.map((t) => (
              <TonePill
                key={t.value}
                tokens={tokens}
                tone={t}
                active={prefs.tone === t.value}
                onPress={() => void patch({ tone: t.value })}
              />
            ))}
          </View>

          {/* Quiet hours — two time rows. Mirrors /reminders' picker. */}
          <SectionHeader tokens={tokens} title="Quiet hours" />
          <Text
            style={{
              color: tokens.textQuiet,
              fontSize: 13,
              lineHeight: 19,
              marginBottom: 12,
            }}
          >
            We won't send anything during these hours. {tzLabel}
          </Text>
          <View style={{ gap: 12 }}>
            <TimeRow
              tokens={tokens}
              label="From"
              value={prefs.quietHoursStart}
              onChange={(v) => void patch({ quietHoursStart: v })}
            />
            <TimeRow
              tokens={tokens}
              label="Until"
              value={prefs.quietHoursEnd}
              onChange={(v) => void patch({ quietHoursEnd: v })}
            />
          </View>

          {/* Snooze — pause everything for a week. */}
          <SectionHeader tokens={tokens} title="Snooze" />
          <View
            className="rounded-2xl"
            style={{ backgroundColor: tokens.bgInset, padding: 16 }}
          >
            {prefs.pausedUntil ? (
              <View style={{ gap: 12 }}>
                <Text
                  style={{ color: tokens.text, fontSize: 15, lineHeight: 21 }}
                >
                  Paused until {formatPausedUntil(prefs.pausedUntil)}
                </Text>
                <PillButton
                  tokens={tokens}
                  label="Resume"
                  onPress={resume}
                />
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                <Text
                  style={{
                    color: tokens.textTer,
                    fontSize: 14,
                    lineHeight: 20,
                  }}
                >
                  Take a break — we'll hold all notifications for a week.
                </Text>
                <PillButton
                  tokens={tokens}
                  label="Pause for 7 days"
                  onPress={pauseSevenDays}
                />
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({
  tokens,
  title,
}: {
  tokens: AcuityTokens;
  title: string;
}) {
  return (
    <Text
      style={{
        fontFamily: tokens.fontMono,
        fontSize: 10,
        fontWeight: "700",
        letterSpacing: 1.4,
        color: tokens.textTer,
        textTransform: "uppercase",
        marginTop: 28,
        marginBottom: 12,
      }}
    >
      {title}
    </Text>
  );
}

function Toggle({
  tokens,
  value,
  onToggle,
}: {
  tokens: AcuityTokens;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      className="rounded-full justify-center"
      style={{
        height: 32,
        width: 56,
        backgroundColor: value ? tokens.primary : tokens.bgSub,
      }}
    >
      <View
        className="rounded-full"
        style={{
          backgroundColor: "#FFFFFF",
          height: 28,
          width: 28,
          transform: [{ translateX: value ? 26 : 2 }],
        }}
      />
    </Pressable>
  );
}

function SwitchRow({
  tokens,
  label,
  description,
  value,
  onToggle,
  style,
}: {
  tokens: AcuityTokens;
  label: string;
  description?: string;
  value: boolean;
  onToggle: () => void;
  style?: object;
}) {
  return (
    <View
      className="rounded-2xl flex-row items-center"
      style={{
        backgroundColor: tokens.bgInset,
        padding: 16,
        gap: 14,
        ...style,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: tokens.text, fontSize: 15, fontWeight: "500" }}>
          {label}
        </Text>
        {description ? (
          <Text
            style={{ color: tokens.textTer, fontSize: 13, lineHeight: 18 }}
          >
            {description}
          </Text>
        ) : null}
      </View>
      <Toggle tokens={tokens} value={value} onToggle={onToggle} />
    </View>
  );
}

function TonePill({
  tokens,
  tone,
  active,
  onPress,
}: {
  tokens: AcuityTokens;
  tone: { value: NotificationTone; label: string; description: string };
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      className="rounded-2xl flex-row items-center"
      style={{
        backgroundColor: active ? `${tokens.primary}14` : tokens.bgInset,
        borderWidth: 1,
        borderColor: active ? tokens.primary : "transparent",
        padding: 16,
        gap: 14,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            color: active ? tokens.primary : tokens.text,
            fontSize: 15,
            fontWeight: "600",
          }}
        >
          {tone.label}
        </Text>
        <Text style={{ color: tokens.textTer, fontSize: 13, lineHeight: 18 }}>
          {tone.description}
        </Text>
      </View>
      {active ? (
        <Ionicons name="checkmark-circle" size={22} color={tokens.primary} />
      ) : (
        <Ionicons
          name="ellipse-outline"
          size={22}
          color={tokens.textTer}
        />
      )}
    </Pressable>
  );
}

function TimeRow({
  tokens,
  label,
  value,
  onChange,
}: {
  tokens: AcuityTokens;
  label: string;
  value: string;
  onChange: (hhmm: string) => void;
}) {
  const [hourStr, minuteStr] = value.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const validHour = Number.isFinite(hour) ? hour : 21;
  const validMinute = Number.isFinite(minute) ? minute : 0;

  const setHour = (h: number) => onChange(`${pad(h)}:${pad(validMinute)}`);
  const setMinute = (m: number) => onChange(`${pad(validHour)}:${pad(m)}`);

  return (
    <View
      className="rounded-2xl"
      style={{ backgroundColor: tokens.bgInset, padding: 16 }}
    >
      <Text
        style={{
          color: tokens.textTer,
          fontSize: 13,
          fontWeight: "600",
          marginBottom: 12,
        }}
      >
        {label}
      </Text>
      <ReminderTimePicker
        hour24={validHour}
        minute={validMinute}
        onChangeHour24={setHour}
        onChangeMinute={setMinute}
        size="md"
      />
    </View>
  );
}

function PillButton({
  tokens,
  label,
  onPress,
}: {
  tokens: AcuityTokens;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="self-start rounded-full"
      style={{
        backgroundColor: tokens.primary,
        paddingHorizontal: 18,
        paddingVertical: 10,
      }}
    >
      <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}
