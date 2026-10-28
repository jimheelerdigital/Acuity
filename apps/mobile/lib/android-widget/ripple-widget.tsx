/** @jsxImportSource react */
// Plain React JSX on purpose: the widget library walks the element tree by
// component identity, so it must not go through NativeWind's jsx runtime.
import React from "react";
import { FlexWidget, TextWidget } from "react-native-android-widget";
import type { HexColor } from "react-native-android-widget";

import type { WidgetSnapshot } from "./snapshot";
import { widgetColors, type WidgetColors } from "./theme";

/**
 * Android home-screen widget: the same content as the iOS widget
 * (targets/widget/index.swift) — streak plus today's habits (each with its
 * own streak). A tap opens Habits, or starts a check-in when there are none.
 *
 * Android draws widgets with RemoteViews, so this is built from
 * react-native-android-widget primitives (FlexWidget / TextWidget), not
 * normal React Native views. One resizable widget: narrow sizes show the
 * small layout, wide sizes add the habit list (like iOS small vs medium).
 */

/** Same deep links the iOS widget uses: recorder (auto-start) and Habits. */
export const RECORD_URI = "acuity://record?autostart=1";
export const HABITS_URI = "acuity://habits";

type Palette = WidgetColors;

/** Wider than this (dp) → medium layout with the habit list. */
const MEDIUM_MIN_WIDTH = 250;

function localDateToday(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/**
 * The snapshot is written when the app loads habits. If the day has rolled
 * over since, yesterday's checks no longer apply, so treat the list as not
 * started rather than showing stale ticks.
 */
function forToday(s: WidgetSnapshot | null): WidgetSnapshot | null {
  if (!s) return null;
  if (s.localDate && s.localDate !== localDateToday()) {
    return { ...s, habits: s.habits.map((h) => ({ ...h, done: false })) };
  }
  return s;
}

function statusLine(s: WidgetSnapshot | null): string {
  if (!s || s.habits.length === 0) return "Tap to reflect";
  const left = s.habits.filter((h) => !h.done).length;
  if (left === 0) return "All done today ✓";
  return `${left} habit${left === 1 ? "" : "s"} left`;
}

/**
 * "DAILY STREAK" header, flame beside a big number, "day(s)" under it,
 * centered as one group (same panel as the iOS widget, 2026-10-28).
 */
function DailyStreakPanel({ streak, c }: { streak: number; c: Palette }) {
  return (
    <FlexWidget
      style={{
        height: "match_parent",
        width: "match_parent",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flexGap: 2,
      }}
    >
      <TextWidget
        text="DAILY STREAK"
        style={{ fontSize: 9, fontWeight: "700", letterSpacing: 0.08, color: c.textSec as HexColor }}
      />
      <FlexWidget style={{ flexDirection: "row", alignItems: "center", flexGap: 2 }}>
        <TextWidget text="🔥" style={{ fontSize: 20 }} />
        <TextWidget
          text={String(streak)}
          style={{ fontSize: 38, fontWeight: "800", color: c.text as HexColor }}
        />
      </FlexWidget>
      <TextWidget
        text={streak === 1 ? "day" : "days"}
        style={{ fontSize: 12, fontWeight: "600", color: c.accentInk as HexColor }}
      />
    </FlexWidget>
  );
}

function SmallLayout({ s, c }: { s: WidgetSnapshot | null; c: Palette }) {
  const allDone = !!s && s.habits.length > 0 && s.habits.every((h) => h.done);
  return (
    <FlexWidget
      style={{
        height: "match_parent",
        width: "match_parent",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <FlexWidget style={{ flex: 1, width: "match_parent" }}>
        <DailyStreakPanel streak={s?.streak ?? 0} c={c} />
      </FlexWidget>
      <TextWidget
        text={statusLine(s)}
        style={{
          fontSize: 13,
          fontWeight: allDone ? "600" : "500",
          color: (allDone ? c.accentInk : c.textSec) as HexColor,
        }}
      />
    </FlexWidget>
  );
}

/**
 * Habits on the left, each habit's streak LEFT of its check circle (a
 * fixed column so circles line up; none when no habit has a streak); the
 * daily streak on the right, set apart by a vertical line (Jimmy,
 * 2026-10-28, same as iOS).
 */
function MediumLayout({
  s,
  c,
  maxRows,
}: {
  s: WidgetSnapshot | null;
  c: Palette;
  maxRows: number;
}) {
  const habits = (s?.habits ?? []).slice(0, maxRows);
  const streakCol = habits.some((h) => (h.streak ?? 0) > 0) ? 30 : 0;
  return (
    <FlexWidget
      style={{
        height: "match_parent",
        width: "match_parent",
        flexDirection: "row",
        alignItems: "center",
        flexGap: 12,
      }}
    >
      <FlexWidget
        style={{ flex: 1, height: "match_parent", flexDirection: "column", justifyContent: "center", flexGap: 9 }}
      >
        {habits.length === 0 ? (
          <TextWidget
            text="Tap to start today's debrief"
            style={{ fontSize: 14, fontWeight: "500", color: c.textSec as HexColor }}
          />
        ) : (
          habits.map((h, i) => (
            <FlexWidget
              key={`${i}-${h.name}`}
              style={{ flexDirection: "row", alignItems: "center", flexGap: streakCol ? 6 : 0 }}
            >
              {streakCol ? (
                <FlexWidget style={{ width: streakCol, flexDirection: "row", justifyContent: "flex-end" }}>
                  {(h.streak ?? 0) > 0 ? (
                    <TextWidget
                      text={`🔥${h.streak}`}
                      style={{ fontSize: 12, fontWeight: "700", color: c.textSec as HexColor }}
                    />
                  ) : null}
                </FlexWidget>
              ) : null}
              <TextWidget
                text={h.done ? "●" : "○"}
                style={{ fontSize: 17, color: (h.done ? c.accent : c.accentSoft) as HexColor }}
              />
              <FlexWidget style={{ flex: 1, marginLeft: 6 }}>
                <TextWidget
                  text={h.name}
                  maxLines={1}
                  truncate="END"
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    color: (h.done ? c.textSec : c.text) as HexColor,
                  }}
                />
              </FlexWidget>
            </FlexWidget>
          ))
        )}
      </FlexWidget>
      <FlexWidget
        style={{ width: 1, height: "match_parent", marginVertical: 8, backgroundColor: c.accentSoft as HexColor }}
      />
      <FlexWidget style={{ width: 92, height: "match_parent" }}>
        <DailyStreakPanel streak={s?.streak ?? 0} c={c} />
      </FlexWidget>
    </FlexWidget>
  );
}

function Root({
  s,
  c,
  width,
  height,
}: {
  s: WidgetSnapshot | null;
  c: Palette;
  width: number;
  height: number;
}) {
  // ~22dp per habit row after padding; never fewer than 1, never more than 4
  // (matches iOS medium).
  const maxRows = Math.max(1, Math.min(4, Math.floor((height - 32) / 22)));
  // With habits on it, a tap opens Habits (Keenan, 2026-10-27); with
  // none yet, it still starts a check-in.
  const hasHabits = (s?.habits.length ?? 0) > 0;
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: hasHabits ? HABITS_URI : RECORD_URI }}
      accessibilityLabel={hasHabits ? "Ripple: open habits" : "Ripple: start a check-in"}
      style={{
        height: "match_parent",
        width: "match_parent",
        backgroundColor: c.bg as HexColor,
        borderRadius: 22,
        padding: 16,
      }}
    >
      {width >= MEDIUM_MIN_WIDTH ? (
        <MediumLayout s={s} c={c} maxRows={maxRows} />
      ) : (
        <SmallLayout s={s} c={c} />
      )}
    </FlexWidget>
  );
}

/**
 * Light + dark representations; the launcher picks based on the system
 * theme. `width`/`height` are the widget's current size in dp; `accent` is
 * the user's palette primary (null → Ripple coral).
 */
export function renderRippleWidget(
  snapshot: WidgetSnapshot | null,
  width: number,
  height: number,
  accent: string | null = null
) {
  const s = forToday(snapshot);
  return {
    light: <Root s={s} c={widgetColors(accent, false)} width={width} height={height} />,
    dark: <Root s={s} c={widgetColors(accent, true)} width={width} height={height} />,
  };
}
