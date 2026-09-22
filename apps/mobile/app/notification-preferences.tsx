import { Ionicons } from "@expo/vector-icons";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TONES,
  defaultNotificationPreferences,
  type NotificationCategory,
  type NotificationPreferences,
  type NotificationTone,
} from "@acuity/shared";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
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
import {
  getPermissionStatus,
  requestNotificationPermission,
  type PermissionStatus,
} from "@/lib/notifications";
import type { AcuityTokens } from "@/lib/theme/tokens";

/**
 * Notification Center (1.6) — the single settings surface for every
 * reminder and notification. Merges the old /reminders (time/day
 * scheduling) and /notification-preferences (per-type toggles, tone,
 * quiet hours) into one screen.
 *
 * Reminder DELIVERY is server-owned as of 1.6 (see the web dispatcher):
 * this screen only PERSISTS the user's choices — reminder rows via
 * /api/account/reminders, per-type toggles/tone/quiet via
 * /api/account/notification-preferences, and the master on/off via
 * /api/account/notifications. Nothing is scheduled on-device.
 *
 * Save style:
 *   - Toggles / tone / quiet hours: optimistic patch (revert on failure).
 *   - Reminder times/days: an explicit "Save times" button (a time
 *     picker fires many changes mid-scroll — one PUT per drag is wrong).
 */

const DAY_LABELS: Array<{ i: number; label: string }> = [
  { i: 0, label: "S" },
  { i: 1, label: "M" },
  { i: 2, label: "T" },
  { i: 3, label: "W" },
  { i: 4, label: "T" },
  { i: 5, label: "F" },
  { i: 6, label: "S" },
];

const MAX_REMINDERS = 5;

// The reflection reminder is category `habit_reminder`; it's represented on
// this screen by the "Daily reflection" time editor rather than a toggle, and
// stays enabled whenever notifications are on. The other stay-on-track types
// render as toggles, in display order.
const STAY_TOGGLE_KEYS: NotificationCategory[] = [
  "habit_nudge",
  "streak_preservation",
  "milestone_celebration",
  "surprise_checkin",
];

const PERSONALIZED_KEYS: NotificationCategory[] = [
  "goal_nudge",
  "task_reminder",
  "theme_followup",
  "life_area_check",
];

type ServerReminder = {
  id: string;
  time: string;
  daysActive: number[];
  enabled: boolean;
  sortOrder: number;
};

type LocalReminder = {
  id: string;
  isDraft: boolean;
  time: string;
  daysActive: number[];
  enabled: boolean;
  sortOrder: number;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function catDef(key: NotificationCategory) {
  return NOTIFICATION_CATEGORIES.find((c) => c.key === key);
}

function reminderFromServer(s: ServerReminder): LocalReminder {
  return { ...s, isDraft: false };
}

function defaultReminder(sortOrder: number): LocalReminder {
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    isDraft: true,
    time: "21:00",
    daysActive: [0, 1, 2, 3, 4, 5, 6],
    enabled: true,
    sortOrder,
  };
}

export default function NotificationCenterScreen() {
  const { tokens } = useTheme();
  const router = useRouter();
  const tzLabel = useLocalTimezoneLabel();

  const [loading, setLoading] = useState(true);
  const [masterEnabled, setMasterEnabled] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences>(
    defaultNotificationPreferences()
  );
  const [reminders, setReminders] = useState<LocalReminder[]>([]);
  const [remindersDirty, setRemindersDirty] = useState(false);
  const [savingReminders, setSavingReminders] = useState(false);
  const [permission, setPermission] =
    useState<PermissionStatus>("undetermined");

  const load = useCallback(async () => {
    try {
      const [me, list, pref, perm] = await Promise.all([
        api.get<{ user: { notificationsEnabled?: boolean } }>("/api/user/me"),
        api.get<{ reminders: ServerReminder[] }>("/api/account/reminders"),
        api
          .get<{ preferences: NotificationPreferences }>(
            "/api/account/notification-preferences"
          )
          .catch(() => null),
        getPermissionStatus(),
      ]);
      setMasterEnabled(!!me.user?.notificationsEnabled);
      const fromServer = (list.reminders ?? []).map(reminderFromServer);
      setReminders(fromServer.length > 0 ? fromServer : [defaultReminder(0)]);
      if (pref?.preferences) setPrefs(pref.preferences);
      setPermission(perm);
    } catch {
      // silent — defaults already populated
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Master on/off. Optimistic.
  const toggleMaster = useCallback(async () => {
    const next = !masterEnabled;
    setMasterEnabled(next);
    try {
      await api.post("/api/account/notifications", {
        notificationsEnabled: next,
      });
      if (next && permission !== "granted") void askPermission();
    } catch {
      setMasterEnabled(!next);
      Alert.alert("Couldn't save", "Please try again.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterEnabled, permission]);

  // Per-type toggles / tone / quiet hours. Optimistic patch.
  const patch = useCallback(
    async (changed: Partial<NotificationPreferences>) => {
      const prev = prefs;
      setPrefs({ ...prev, ...changed });
      try {
        const res = await api.put<{ preferences: NotificationPreferences }>(
          "/api/account/notification-preferences",
          changed
        );
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

  // ── Reminder editor (Daily reflection) ──────────────────────────────
  const updateReminder = (id: string, p: Partial<Omit<LocalReminder, "id">>) => {
    setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)));
    setRemindersDirty(true);
  };

  const toggleDay = (id: string, dayIndex: number) => {
    setReminders((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              daysActive: r.daysActive.includes(dayIndex)
                ? r.daysActive.filter((d) => d !== dayIndex)
                : [...r.daysActive, dayIndex].sort(),
            }
          : r
      )
    );
    setRemindersDirty(true);
  };

  const removeReminder = (id: string) => {
    setReminders((prev) => prev.filter((r) => r.id !== id));
    setRemindersDirty(true);
  };

  const addReminder = () => {
    if (reminders.length >= MAX_REMINDERS) return;
    setReminders((prev) => [...prev, defaultReminder(prev.length)]);
    setRemindersDirty(true);
  };

  const saveReminders = async () => {
    setSavingReminders(true);
    try {
      const putBody = reminders.map((r, i) => ({
        time: r.time,
        daysActive: r.daysActive,
        enabled: r.enabled,
        sortOrder: i,
      }));
      const res = await api.put<{ reminders: ServerReminder[] }>(
        "/api/account/reminders",
        { reminders: putBody }
      );
      const fromServer = (res.reminders ?? []).map(reminderFromServer);
      if (fromServer.length > 0) setReminders(fromServer);
      // The reflection reminder only sends if its category is on. Keep
      // `habit_reminder` enabled whenever the user is actively keeping
      // reminder times — the time editor IS that category's control here.
      if (!prefs.enabledCategories.includes("habit_reminder")) {
        void patch({
          enabledCategories: [...prefs.enabledCategories, "habit_reminder"],
        });
      }
      setRemindersDirty(false);
    } catch (err) {
      const msg = (err as { message?: string })?.message;
      Alert.alert("Couldn't save", msg ?? "Please try again.");
    } finally {
      setSavingReminders(false);
    }
  };

  const askPermission = async () => {
    const next = await requestNotificationPermission();
    setPermission(next);
    if (next === "denied") {
      Alert.alert(
        "Notifications are off",
        Platform.OS === "ios"
          ? "Turn them on in iOS Settings to get reminders."
          : "Turn on notifications in system settings to get reminders."
      );
    }
  };

  const openSettings = () => {
    if (Platform.OS === "ios") Linking.openURL("app-settings:").catch(() => {});
    else Linking.openSettings().catch(() => {});
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

  const dim = masterEnabled ? 1 : 0.4;

  return (
    <SafeAreaView
      edges={["top"]}
      className="flex-1"
      style={{ backgroundColor: tokens.bg }}
    >
      <StickyBackButton accessibilityLabel="Back to Settings" />
      <ScrollView
        contentContainerStyle={{
          paddingTop: 80,
          paddingBottom: 48,
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
          Tailor what Ripple sends, and when.
        </Text>

        {/* All notifications on/off. */}
        <SwitchRow
          tokens={tokens}
          label="All notifications"
          description="Turn everything off at once."
          value={masterEnabled}
          onToggle={() => void toggleMaster()}
          style={{ marginTop: 28 }}
        />

        {masterEnabled && permission !== "granted" ? (
          <Pressable
            onPress={permission === "denied" ? openSettings : askPermission}
            className="rounded-2xl"
            style={{
              backgroundColor: `${tokens.primary}14`,
              borderWidth: 1,
              borderColor: tokens.primary,
              padding: 14,
              marginTop: 12,
            }}
          >
            <Text style={{ color: tokens.primary, fontSize: 14, fontWeight: "600" }}>
              {permission === "denied"
                ? "Notifications are off in system settings — tap to open"
                : "Allow notifications so reminders can reach you"}
            </Text>
          </Pressable>
        ) : null}

        <View style={{ opacity: dim }} pointerEvents={masterEnabled ? "auto" : "none"}>
          {/* ── Stay on track ─────────────────────────────────────── */}
          <SectionHeader tokens={tokens} title="Stay on track" />
          <Text style={helpStyle(tokens)}>
            Gentle nudges based on how you use Ripple — never on what you talked
            about.
          </Text>

          {/* Daily reflection = the reminder time editor. */}
          <ReflectionReminders
            tokens={tokens}
            reminders={reminders}
            dirty={remindersDirty}
            saving={savingReminders}
            tzLabel={tzLabel}
            onUpdate={updateReminder}
            onToggleDay={toggleDay}
            onRemove={removeReminder}
            onAdd={addReminder}
            onSave={() => void saveReminders()}
          />

          {/* Habit nudges + the per-habit pointer. */}
          <View style={{ gap: 8, marginTop: 8 }}>
            <SwitchRow
              tokens={tokens}
              label={catDef("habit_nudge")?.label ?? "Habit nudges"}
              description={catDef("habit_nudge")?.description}
              value={prefs.enabledCategories.includes("habit_nudge")}
              onToggle={() => toggleCategory("habit_nudge")}
            />
            <Pressable
              onPress={() => router.push("/(tabs)/goals")}
              className="rounded-2xl flex-row items-center"
              style={{
                backgroundColor: tokens.bgInset,
                borderWidth: 1,
                borderColor: tokens.lineStrong,
                padding: 16,
                gap: 12,
              }}
            >
              <Text style={{ flex: 1, color: tokens.textSec, fontSize: 13 }}>
                Set each habit's nudge time on the habit itself.
              </Text>
              <Ionicons name="chevron-forward" size={18} color={tokens.textTer} />
            </Pressable>

            {STAY_TOGGLE_KEYS.filter((k) => k !== "habit_nudge").map((key) => {
              const c = catDef(key);
              if (!c) return null;
              return (
                <SwitchRow
                  key={key}
                  tokens={tokens}
                  label={c.label}
                  description={c.description}
                  value={prefs.enabledCategories.includes(key)}
                  onToggle={() => toggleCategory(key)}
                />
              );
            })}
          </View>

          {/* ── Personalized ──────────────────────────────────────── */}
          <SectionHeader tokens={tokens} title="Personalized — off by default" />
          <Text style={helpStyle(tokens)}>
            Anything Ripple picked up from what you said. Always your choice.
          </Text>
          <View style={{ gap: 8 }}>
            {PERSONALIZED_KEYS.map((key) => {
              const c = catDef(key);
              if (!c) return null;
              return (
                <SwitchRow
                  key={key}
                  tokens={tokens}
                  label={c.label}
                  description={c.description}
                  value={prefs.enabledCategories.includes(key)}
                  onToggle={() => toggleCategory(key)}
                />
              );
            })}
          </View>

          {/* ── Style: tone ───────────────────────────────────────── */}
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

          {/* ── Quiet hours ───────────────────────────────────────── */}
          <SectionHeader tokens={tokens} title="Quiet hours" />
          <Text style={helpStyle(tokens)}>
            No surprise nudges during these hours. Reminders you scheduled still
            arrive. {tzLabel}
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
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function helpStyle(tokens: AcuityTokens) {
  return {
    color: tokens.textTer,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  } as const;
}

function ReflectionReminders({
  tokens,
  reminders,
  dirty,
  saving,
  tzLabel,
  onUpdate,
  onToggleDay,
  onRemove,
  onAdd,
  onSave,
}: {
  tokens: AcuityTokens;
  reminders: LocalReminder[];
  dirty: boolean;
  saving: boolean;
  tzLabel: string;
  onUpdate: (id: string, p: Partial<Omit<LocalReminder, "id">>) => void;
  onToggleDay: (id: string, dayIndex: number) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  onSave: () => void;
}) {
  return (
    <View
      className="rounded-2xl"
      style={{
        backgroundColor: tokens.bgInset,
        borderWidth: 1,
        borderColor: tokens.lineStrong,
        padding: 16,
        gap: 14,
      }}
    >
      <View>
        <Text style={{ color: tokens.text, fontSize: 15, fontWeight: "500" }}>
          Daily reflection
        </Text>
        <Text style={{ color: tokens.textSec, fontSize: 13, marginTop: 2 }}>
          A reminder to debrief around when you usually do. {tzLabel}
        </Text>
      </View>

      {reminders.map((r) => {
        const [h, m] = r.time.split(":");
        const hour = Number.isFinite(Number(h)) ? Number(h) : 21;
        const minute = Number.isFinite(Number(m)) ? Number(m) : 0;
        return (
          <View
            key={r.id}
            className="rounded-2xl"
            style={{
              backgroundColor: tokens.bg,
              borderWidth: 1,
              borderColor: tokens.line,
              padding: 14,
              gap: 12,
              opacity: r.enabled ? 1 : 0.5,
            }}
          >
            <View className="flex-row items-center" style={{ gap: 12 }}>
              <View style={{ flex: 1 }}>
                <ReminderTimePicker
                  hour24={hour}
                  minute={minute}
                  onChangeHour24={(hh) => onUpdate(r.id, { time: `${pad(hh)}:${pad(minute)}` })}
                  onChangeMinute={(mm) => onUpdate(r.id, { time: `${pad(hour)}:${pad(mm)}` })}
                  size="md"
                />
              </View>
              <Pressable
                onPress={() => onUpdate(r.id, { enabled: !r.enabled })}
                accessibilityRole="switch"
                accessibilityState={{ checked: r.enabled }}
                className="rounded-full justify-center"
                style={{
                  height: 30,
                  width: 52,
                  backgroundColor: r.enabled ? tokens.primary : tokens.bgSub,
                }}
              >
                <View
                  className="rounded-full"
                  style={{
                    backgroundColor: "#FFFFFF",
                    height: 26,
                    width: 26,
                    transform: [{ translateX: r.enabled ? 24 : 2 }],
                  }}
                />
              </Pressable>
            </View>

            <View className="flex-row" style={{ gap: 7 }}>
              {DAY_LABELS.map((d) => {
                const on = r.daysActive.includes(d.i);
                return (
                  <Pressable
                    key={d.i}
                    onPress={() => onToggleDay(r.id, d.i)}
                    className="rounded-full items-center justify-center"
                    style={{
                      width: 32,
                      height: 32,
                      backgroundColor: on ? tokens.primary : tokens.bgSub,
                    }}
                  >
                    <Text
                      style={{
                        color: on ? "#2a1005" : tokens.textTer,
                        fontSize: 12.5,
                        fontWeight: "700",
                      }}
                    >
                      {d.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {reminders.length > 1 ? (
              <Pressable onPress={() => onRemove(r.id)} className="self-start">
                <Text style={{ color: tokens.bad, fontSize: 13, fontWeight: "600" }}>
                  Remove
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}

      <View className="flex-row items-center" style={{ gap: 12 }}>
        {reminders.length < MAX_REMINDERS ? (
          <Pressable
            onPress={onAdd}
            className="rounded-full"
            style={{
              borderWidth: 1,
              borderColor: tokens.primary,
              borderStyle: "dashed",
              paddingHorizontal: 14,
              paddingVertical: 9,
            }}
          >
            <Text style={{ color: tokens.primary, fontSize: 13.5, fontWeight: "600" }}>
              + Add a time
            </Text>
          </Pressable>
        ) : null}
        {dirty ? (
          <Pressable
            onPress={onSave}
            disabled={saving}
            className="rounded-full"
            style={{
              backgroundColor: tokens.primary,
              paddingHorizontal: 18,
              paddingVertical: 10,
              opacity: saving ? 0.5 : 1,
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "700" }}>
              {saving ? "Saving…" : "Save times"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function SectionHeader({ tokens, title }: { tokens: AcuityTokens; title: string }) {
  return (
    <Text
      style={{
        fontFamily: tokens.fontMono,
        fontSize: 12,
        fontWeight: "700",
        letterSpacing: 1.4,
        color: tokens.textSec,
        textTransform: "uppercase",
        marginTop: 28,
        marginBottom: 12,
      }}
    >
      {title}
    </Text>
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
        borderWidth: 1,
        borderColor: tokens.lineStrong,
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
          <Text style={{ color: tokens.textSec, fontSize: 13, lineHeight: 18 }}>
            {description}
          </Text>
        ) : null}
      </View>
      <Toggle tokens={tokens} value={value} onToggle={onToggle} />
    </View>
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
        <Text style={{ color: tokens.textSec, fontSize: 13, lineHeight: 18 }}>
          {tone.description}
        </Text>
      </View>
      <Ionicons
        name={active ? "checkmark-circle" : "ellipse-outline"}
        size={22}
        color={active ? tokens.primary : tokens.textTer}
      />
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
  const validHour = Number.isFinite(Number(hourStr)) ? Number(hourStr) : 21;
  const validMinute = Number.isFinite(Number(minuteStr)) ? Number(minuteStr) : 0;

  return (
    <View
      className="rounded-2xl"
      style={{
        backgroundColor: tokens.bgInset,
        borderWidth: 1,
        borderColor: tokens.lineStrong,
        padding: 16,
      }}
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
        onChangeHour24={(h) => onChange(`${pad(h)}:${pad(validMinute)}`)}
        onChangeMinute={(m) => onChange(`${pad(validHour)}:${pad(m)}`)}
        size="md"
      />
    </View>
  );
}
