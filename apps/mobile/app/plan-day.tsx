import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ProLockedCard } from "@/components/pro-locked-card";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import { cachedGet } from "@/lib/cache";
import { eventTitle, type StoredBlock } from "@/lib/calendar-op";
import {
  calendarPermission,
  createEvent,
  DEVICE_PROVIDER,
  deviceCalendarAvailable,
  eventExists,
  readEvents,
  updateEvent,
} from "@/lib/device-calendar";
import {
  loadPlanSettings,
  savePlannedBlocks,
  savePlanSettings,
} from "@/lib/day-plan-store";
import { isFreeTierUser } from "@/lib/free-tier";
import { goBackOr } from "@/lib/navigation";
import {
  busyIntervals,
  clampSettings,
  DEFAULT_PLAN_SETTINGS,
  nextBlockMinutes,
  planDay,
  type Interval,
  type PlanSettings,
} from "@/lib/plan-day";
import {
  localYmd,
  selectTodayTasks,
  taskLabel,
  type TodayTaskInput,
} from "@/lib/today-tasks";

/**
 * Plan my day (1.9.6). Jimmy: "plan my day is awesome, would require
 * calendar integration to be finished."
 *
 * Takes the TODAY list (overdue → due today → high priority) and fits each
 * task into a free gap on today's calendar, inside the workday. Preview
 * first: change a block's length, drop a task, adjust the workday. Nothing
 * touches the calendar until "Add to calendar". Each task gets ONE event:
 * if it already has one (auto-add), that event moves to the block.
 *
 * Needs the phone calendar connected (Profile → Calendar), which is Pro.
 */

type Task = TodayTaskInput & { calendarEventId?: string | null };
type Settings = { connected: boolean; calendar: { provider: string; targetCalendarId: string | null } | null };

type Phase =
  | { kind: "loading" }
  | { kind: "needs-calendar"; reason: "not-connected" | "permission" | "unavailable" }
  | { kind: "error"; message: string }
  | { kind: "ready" }
  | { kind: "saving" }
  | { kind: "done"; added: number; failed: number };

const TASKS_CACHE_KEY = "/api/tasks?all=1";

function timeLabel(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function hourLabel(h: number): string {
  return timeLabel(new Date(2000, 0, 1, h % 24, 0, 0));
}

export default function PlanDayScreen() {
  const { tokens } = useTheme();
  const { user } = useAuth();
  const locked = isFreeTierUser(user);

  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState<Interval[]>([]);
  const [targetCalendarId, setTargetCalendarId] = useState<string | null>(null);
  const [settings, setSettings] = useState<PlanSettings>(DEFAULT_PLAN_SETTINGS);
  const [minutes, setMinutes] = useState<Record<string, number>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    setPhase({ kind: "loading" });
    if (!deviceCalendarAvailable()) {
      setPhase({ kind: "needs-calendar", reason: "unavailable" });
      return;
    }
    try {
      const s = await api.get<Settings>("/api/integrations/calendar/settings");
      if (!s.connected || s.calendar?.provider !== DEVICE_PROVIDER || !s.calendar.targetCalendarId) {
        setPhase({ kind: "needs-calendar", reason: "not-connected" });
        return;
      }
      if ((await calendarPermission()) !== "granted") {
        setPhase({ kind: "needs-calendar", reason: "permission" });
        return;
      }
      const t = new Date();
      const dayStart = new Date(t.getFullYear(), t.getMonth(), t.getDate());
      const dayEnd = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
      const [taskRes, events, saved] = await Promise.all([
        cachedGet<{ tasks: Task[] }>(TASKS_CACHE_KEY, { force: true }),
        readEvents(dayStart, dayEnd),
        loadPlanSettings(),
      ]);
      setTargetCalendarId(s.calendar.targetCalendarId);
      setTasks(taskRes.tasks ?? []);
      setBusy(busyIntervals(events));
      setSettings(saved);
      setNow(t);
      setPhase({ kind: "ready" });
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "Couldn't load your day.",
      });
    }
  }, []);

  useEffect(() => {
    if (!locked) void load();
  }, [locked, load]);

  const candidates = useMemo(
    () => selectTodayTasks(tasks, now).filter((t) => !skipped.has(t.task.id)),
    [tasks, now, skipped]
  );
  const skippedTasks = useMemo(
    () => selectTodayTasks(tasks, now).filter((t) => skipped.has(t.task.id)),
    [tasks, now, skipped]
  );
  const plan = useMemo(
    () => planDay(candidates, busy, { now, settings, minutesFor: (id) => minutes[id] }),
    [candidates, busy, now, settings, minutes]
  );

  const changeSettings = (next: PlanSettings) => {
    const c = clampSettings(next);
    setSettings(c);
    void savePlanSettings(c);
  };

  const confirm = async () => {
    if (!targetCalendarId || plan.blocks.length === 0) return;
    setPhase({ kind: "saving" });
    const day = localYmd(now);
    const stored: Record<string, StoredBlock> = {};
    let added = 0;
    let failed = 0;
    for (const b of plan.blocks) {
      const input = {
        title: eventTitle(taskLabel(b.task), false),
        start: b.start,
        end: b.end,
        allDay: false,
      };
      try {
        let id = (b.task as Task).calendarEventId ?? null;
        if (id && (await eventExists(id))) {
          await updateEvent(id, input);
        } else {
          id = await createEvent(targetCalendarId, { ...input, notes: "Planned by Ripple" });
        }
        stored[b.task.id] = { day, start: b.start.toISOString(), end: b.end.toISOString() };
        // Links the event to the task so checking it off marks the event ✓.
        await api
          .post("/api/integrations/calendar/sync-result", {
            taskId: b.task.id,
            ok: true,
            providerEventId: id,
          })
          .catch(() => {});
        added++;
      } catch {
        failed++;
      }
    }
    await savePlannedBlocks(stored);
    Haptics.notificationAsync(
      failed === 0 ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning
    ).catch(() => {});
    setPhase({ kind: "done", added, failed });
  };

  const header = (
    <View
      className="flex-row items-center justify-between px-5 pt-2 pb-3 border-b"
      style={{ borderColor: tokens.line }}
    >
      <Pressable onPress={() => goBackOr("/(tabs)/tasks")} hitSlop={10} accessibilityRole="button">
        <Text className="text-sm font-semibold" style={{ color: tokens.primary }}>
          {phase.kind === "done" ? "Done" : "Cancel"}
        </Text>
      </Pressable>
      <Text className="text-base font-semibold" style={{ color: tokens.text }}>
        Plan my day
      </Text>
      <View style={{ width: 48 }} />
    </View>
  );

  const card = { borderColor: tokens.line, backgroundColor: tokens.cardBg };

  let body: React.ReactNode;
  if (locked) {
    body = <ProLockedCard surfaceId="calendar_connect_locked" />;
  } else if (phase.kind === "loading" || phase.kind === "saving") {
    body = (
      <View className="items-center mt-16">
        <ActivityIndicator color={tokens.primary} />
        <Text className="text-sm mt-3" style={{ color: tokens.textSec }}>
          {phase.kind === "saving" ? "Adding to your calendar…" : "Looking at your day…"}
        </Text>
      </View>
    );
  } else if (phase.kind === "needs-calendar") {
    body = (
      <View className="rounded-xl border p-5" style={card}>
        <Ionicons name="calendar-outline" size={26} color={tokens.primary} />
        <Text className="text-base font-semibold mt-3" style={{ color: tokens.text }}>
          {phase.reason === "unavailable" ? "Update Ripple to plan your day" : "Connect your calendar first"}
        </Text>
        <Text className="text-sm mt-1" style={{ color: tokens.textSec, lineHeight: 20 }}>
          {phase.reason === "unavailable"
            ? "Plan my day needs the latest version of Ripple from the App Store."
            : phase.reason === "permission"
              ? "Ripple needs access to your calendar to find free time. Turn it on in Settings → Ripple → Calendars."
              : "Plan my day fits your tasks around the meetings already on your calendar."}
        </Text>
        {phase.reason === "not-connected" ? (
          <Pressable
            onPress={() => router.push("/integrations")}
            className="mt-4 rounded-xl py-3 items-center"
            style={{ backgroundColor: tokens.primary }}
            accessibilityRole="button"
          >
            <Text className="text-sm font-semibold" style={{ color: "#fff" }}>
              Connect calendar
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  } else if (phase.kind === "error") {
    body = (
      <View className="items-center mt-16">
        <Text className="text-sm" style={{ color: tokens.textSec }}>
          Couldn't load your day.
        </Text>
        <Pressable onPress={() => void load()} className="mt-3" accessibilityRole="button">
          <Text className="text-sm font-semibold" style={{ color: tokens.primary }}>
            Try again
          </Text>
        </Pressable>
      </View>
    );
  } else if (phase.kind === "done") {
    body = (
      <View className="items-center mt-12 px-4">
        <Ionicons name="checkmark-circle" size={44} color={tokens.primary} />
        <Text className="text-lg font-semibold mt-3 text-center" style={{ color: tokens.text }}>
          {phase.added === 1 ? "1 block added" : `${phase.added} blocks added`}
        </Text>
        <Text className="text-sm mt-1 text-center" style={{ color: tokens.textSec, lineHeight: 20 }}>
          {phase.failed > 0
            ? `${phase.failed} couldn't be added. Try again in a moment.`
            : "Check one off in Ripple and its event gets a ✓."}
        </Text>
      </View>
    );
  } else {
    body = (
      <>
        <WorkdayRow settings={settings} onChange={changeSettings} />

        {!plan.window ? (
          <Text className="text-sm mt-4" style={{ color: tokens.textSec, lineHeight: 20 }}>
            Your workday is over. Move the end time later to plan the rest of today.
          </Text>
        ) : candidates.length === 0 && skippedTasks.length === 0 ? (
          <Text className="text-sm mt-4" style={{ color: tokens.textSec, lineHeight: 20 }}>
            Nothing pressing today: no overdue, due-today or high-priority tasks.
          </Text>
        ) : null}

        {plan.blocks.map((b) => (
          <View key={b.task.id} className="flex-row items-center rounded-xl border px-3 py-3 mb-2" style={card}>
            <View style={{ width: 74 }}>
              <Text className="text-sm font-semibold" style={{ color: tokens.text }}>
                {timeLabel(b.start)}
              </Text>
              <Text className="text-xs" style={{ color: tokens.textTer }}>
                {timeLabel(b.end)}
              </Text>
            </View>
            <Text className="flex-1 text-sm" style={{ color: tokens.text }} numberOfLines={2}>
              {taskLabel(b.task)}
            </Text>
            <Pressable
              onPress={() => setMinutes((m) => ({ ...m, [b.task.id]: nextBlockMinutes(b.minutes) }))}
              className="ml-2 rounded-full px-2.5 py-1"
              style={{ backgroundColor: tokens.bgInset }}
              accessibilityRole="button"
              accessibilityLabel={`${b.minutes} minutes. Change length`}
            >
              <Text className="text-xs font-medium" style={{ color: tokens.textSec }}>
                {b.minutes}m
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSkipped((s) => new Set(s).add(b.task.id))}
              hitSlop={8}
              style={{ padding: 6 }}
              accessibilityRole="button"
              accessibilityLabel={`Leave ${taskLabel(b.task)} out`}
            >
              <Ionicons name="close" size={18} color={tokens.textTer} />
            </Pressable>
          </View>
        ))}

        {plan.window && plan.unscheduled.length > 0 ? (
          <View className="mt-4">
            <Text className="text-xs font-semibold mb-2" style={{ color: tokens.textSec }}>
              DIDN'T FIT TODAY
            </Text>
            {plan.unscheduled.map((t) => (
              <Text key={t.task.id} className="text-sm mb-1" style={{ color: tokens.textTer }} numberOfLines={1}>
                {taskLabel(t.task)}
              </Text>
            ))}
          </View>
        ) : null}

        {skippedTasks.length > 0 ? (
          <View className="mt-4">
            <Text className="text-xs font-semibold mb-2" style={{ color: tokens.textSec }}>
              LEFT OUT
            </Text>
            {skippedTasks.map((t) => (
              <Pressable
                key={t.task.id}
                onPress={() =>
                  setSkipped((s) => {
                    const n = new Set(s);
                    n.delete(t.task.id);
                    return n;
                  })
                }
                className="flex-row items-center mb-1"
                accessibilityRole="button"
                accessibilityLabel={`Add ${taskLabel(t.task)} back`}
              >
                <Ionicons name="add-circle-outline" size={16} color={tokens.primary} />
                <Text className="text-sm ml-2" style={{ color: tokens.textTer }} numberOfLines={1}>
                  {taskLabel(t.task)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </>
    );
  }

  const showConfirm = !locked && phase.kind === "ready" && plan.blocks.length > 0;

  return (
    <SafeAreaView className="flex-1" edges={["top", "bottom"]} style={{ backgroundColor: tokens.bg }}>
      {header}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {phase.kind === "ready" ? (
          <Text className="text-sm mb-4" style={{ color: tokens.textSec, lineHeight: 20 }}>
            Your pressing tasks, fitted around today's calendar. Nothing is added until you tap the button.
          </Text>
        ) : null}
        {body}
      </ScrollView>
      {showConfirm ? (
        <View className="px-5 pb-3 pt-2 border-t" style={{ borderColor: tokens.line }}>
          <Pressable
            onPress={() => void confirm()}
            className="rounded-xl py-3.5 items-center"
            style={{ backgroundColor: tokens.primary }}
            accessibilityRole="button"
          >
            <Text className="text-base font-semibold" style={{ color: "#fff" }}>
              {plan.blocks.length === 1 ? "Add 1 block to calendar" : `Add ${plan.blocks.length} blocks to calendar`}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function WorkdayRow({ settings, onChange }: { settings: PlanSettings; onChange: (s: PlanSettings) => void }) {
  const { tokens } = useTheme();
  const step = (label: string, value: number, set: (v: number) => void, min: number, max: number) => (
    <View className="flex-row items-center">
      <Pressable
        onPress={() => set(value - 1)}
        disabled={value <= min}
        hitSlop={6}
        style={{ padding: 4, opacity: value <= min ? 0.3 : 1 }}
        accessibilityRole="button"
        accessibilityLabel={`${label} earlier`}
      >
        <Ionicons name="remove-circle-outline" size={20} color={tokens.textSec} />
      </Pressable>
      <Text
        className="text-sm font-medium"
        style={{ color: tokens.text, minWidth: 64, textAlign: "center" }}
        accessibilityLabel={`${label} ${hourLabel(value)}`}
      >
        {hourLabel(value)}
      </Text>
      <Pressable
        onPress={() => set(value + 1)}
        disabled={value >= max}
        hitSlop={6}
        style={{ padding: 4, opacity: value >= max ? 0.3 : 1 }}
        accessibilityRole="button"
        accessibilityLabel={`${label} later`}
      >
        <Ionicons name="add-circle-outline" size={20} color={tokens.textSec} />
      </Pressable>
    </View>
  );
  return (
    <View
      className="flex-row items-center justify-between rounded-xl border px-3 py-2 mb-4"
      style={{ borderColor: tokens.line, backgroundColor: tokens.bgInset }}
    >
      <Text className="text-xs font-semibold" style={{ color: tokens.textSec }}>
        WORKDAY
      </Text>
      {step("Start", settings.startHour, (v) => onChange({ ...settings, startHour: v }), 0, settings.endHour - 1)}
      <Text style={{ color: tokens.textTer }}>–</Text>
      {step("End", settings.endHour, (v) => onChange({ ...settings, endHour: v }), settings.startHour + 1, 24)}
    </View>
  );
}
