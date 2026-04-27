import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

/**
 * Shared 12-hour time picker used by onboarding step 9 and the
 * standalone /reminders settings screen. Single source of truth for
 * how the user selects a reminder time.
 *
 * Internal storage stays 24-hour (notificationTime: "HH:MM") for
 * backend symmetry; the UI converts via to24h() / from24h().
 */

export function from24h(h24: number): { hour12: number; period: "AM" | "PM" } {
  const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  let hour12 = h24 % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, period };
}

export function to24h(hour12: number, period: "AM" | "PM"): number {
  if (period === "AM") return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

/**
 * Friendly label for the user's local timezone (e.g. "Eastern Time").
 * Falls back to the raw IANA name, then "your local timezone".
 */
export function useLocalTimezoneLabel(): string {
  return useMemo(() => {
    try {
      const ianaName = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: ianaName,
        timeZoneName: "long",
      }).formatToParts(new Date());
      const longName = parts.find((p) => p.type === "timeZoneName")?.value;
      if (longName) {
        return longName
          .replace(/\bStandard\s+/i, "")
          .replace(/\bDaylight\s+/i, "");
      }
      return ianaName.replace(/_/g, " ");
    } catch {
      return "your local timezone";
    }
  }, []);
}

type Size = "lg" | "md";

/**
 * 12-hour HH : MM picker with AM/PM segmented toggle. Operates on
 * 24-hour state (`hour24` 0-23, `minute` 0-59 in 5-minute steps).
 *
 * `size`:
 *   - "lg" — 56pt numerals, used on the standalone /reminders screen
 *     where the form is the entire viewport
 *   - "md" — 36pt numerals, used inside onboarding step 9 where the
 *     picker shares space with copy + frequency selector
 */
export function ReminderTimePicker({
  hour24,
  minute,
  onChangeHour24,
  onChangeMinute,
  size = "lg",
}: {
  hour24: number;
  minute: number;
  onChangeHour24: (h: number) => void;
  onChangeMinute: (m: number) => void;
  size?: Size;
}) {
  const { hour12, period } = from24h(hour24);

  const bumpHour = (delta: number) => {
    const next12 = ((hour12 - 1 + delta + 12) % 12) + 1;
    onChangeHour24(to24h(next12, period));
  };
  const bumpMinute = (delta: number) =>
    onChangeMinute((minute + delta + 60) % 60);
  const setPeriod = (p: "AM" | "PM") => onChangeHour24(to24h(hour12, p));

  const numeralSize = size === "lg" ? 56 : 36;
  const numeralLineHeight = size === "lg" ? 64 : 44;
  const numeralMinWidth = size === "lg" ? 84 : 56;
  const stepperBtnH = size === "lg" ? 36 : 30;
  const stepperBtnW = size === "lg" ? 48 : 40;
  const colonSize = size === "lg" ? 56 : 36;
  const gap = size === "lg" ? 16 : 10;

  return (
    <View className="flex-row items-center justify-center" style={{ gap }}>
      <Stepper
        value={hour12}
        onIncrement={() => bumpHour(1)}
        onDecrement={() => bumpHour(-1)}
        numeralSize={numeralSize}
        numeralLineHeight={numeralLineHeight}
        numeralMinWidth={numeralMinWidth}
        btnH={stepperBtnH}
        btnW={stepperBtnW}
      />
      <Text
        className="text-zinc-400 dark:text-zinc-500"
        style={{ fontSize: colonSize, fontWeight: "700", lineHeight: numeralLineHeight }}
      >
        :
      </Text>
      <Stepper
        value={minute}
        onIncrement={() => bumpMinute(5)}
        onDecrement={() => bumpMinute(-5)}
        numeralSize={numeralSize}
        numeralLineHeight={numeralLineHeight}
        numeralMinWidth={numeralMinWidth}
        btnH={stepperBtnH}
        btnW={stepperBtnW}
      />

      <View
        className="rounded-full bg-zinc-100 dark:bg-white/10 flex-col"
        style={{ padding: 4, gap: 4, marginLeft: size === "lg" ? 8 : 4 }}
      >
        <PeriodPill
          label="AM"
          active={period === "AM"}
          onPress={() => setPeriod("AM")}
          size={size}
        />
        <PeriodPill
          label="PM"
          active={period === "PM"}
          onPress={() => setPeriod("PM")}
          size={size}
        />
      </View>
    </View>
  );
}

function Stepper({
  value,
  onIncrement,
  onDecrement,
  numeralSize,
  numeralLineHeight,
  numeralMinWidth,
  btnH,
  btnW,
}: {
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  numeralSize: number;
  numeralLineHeight: number;
  numeralMinWidth: number;
  btnH: number;
  btnW: number;
}) {
  return (
    <View className="items-center" style={{ gap: 6 }}>
      <Pressable
        onPress={onIncrement}
        hitSlop={8}
        className="rounded-full border border-zinc-300 dark:border-white/15 items-center justify-center"
        style={{ height: btnH, width: btnW }}
      >
        <Ionicons name="chevron-up" size={20} color="#A1A1AA" />
      </Pressable>
      <Text
        className="font-mono tabular-nums text-zinc-900 dark:text-zinc-50"
        style={{
          fontSize: numeralSize,
          fontWeight: "700",
          lineHeight: numeralLineHeight,
          minWidth: numeralMinWidth,
          textAlign: "center",
        }}
      >
        {String(value).padStart(2, "0")}
      </Text>
      <Pressable
        onPress={onDecrement}
        hitSlop={8}
        className="rounded-full border border-zinc-300 dark:border-white/15 items-center justify-center"
        style={{ height: btnH, width: btnW }}
      >
        <Ionicons name="chevron-down" size={20} color="#A1A1AA" />
      </Pressable>
    </View>
  );
}

function PeriodPill({
  label,
  active,
  onPress,
  size,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  size: Size;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full items-center justify-center ${
        active ? "bg-violet-600" : "bg-transparent"
      }`}
      style={{
        paddingHorizontal: size === "lg" ? 14 : 10,
        paddingVertical: size === "lg" ? 6 : 4,
        minWidth: size === "lg" ? 44 : 36,
      }}
    >
      <Text
        className={active ? "text-white" : "text-zinc-500 dark:text-zinc-400"}
        style={{ fontSize: 13, fontWeight: "700", letterSpacing: 0.5 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
