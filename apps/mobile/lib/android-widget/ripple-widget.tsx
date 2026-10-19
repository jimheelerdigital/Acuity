/** @jsxImportSource react */
// Plain React JSX on purpose: the widget library walks the element tree by
// component identity, so it must not go through NativeWind's jsx runtime.
import React from "react";
import { FlexWidget, TextWidget } from "react-native-android-widget";
import type { HexColor } from "react-native-android-widget";

import type { WidgetSnapshot } from "./snapshot";

/**
 * Android home-screen widget: the same content as the iOS widget
 * (targets/widget/index.swift) — streak plus today's habits, and a tap
 * anywhere starts a check-in.
 *
 * Android draws widgets with RemoteViews, so this is built from
 * react-native-android-widget primitives (FlexWidget / TextWidget), not
 * normal React Native views. One resizable widget: narrow sizes show the
 * small layout, wide sizes add the habit list (like iOS small vs medium).
 */

/** Same deep link the iOS widget uses → recorder, auto-starting. */
export const RECORD_URI = "acuity://record?autostart=1";

const CORAL: HexColor = "#ED9672";

interface Palette {
  bg: HexColor;
  text: HexColor;
  textSec: HexColor;
  accent: HexColor;
}

const LIGHT: Palette = {
  bg: "#FFFFFF",
  text: "#1A1A1A",
  textSec: "#6B7280",
  accent: CORAL,
};

const DARK: Palette = {
  bg: "#1F1D1C",
  text: "#F5F2F0",
  textSec: "#A8A29E",
  accent: CORAL,
};

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

function StreakBadge({ streak, c }: { streak: number; c: Palette }) {
  return (
    <FlexWidget style={{ flexDirection: "row", alignItems: "flex-end", flexGap: 4 }}>
      <TextWidget text="🔥" style={{ fontSize: 22, color: c.accent }} />
      <TextWidget
        text={String(streak)}
        style={{ fontSize: 30, fontWeight: "700", color: c.text }}
      />
      <TextWidget
        text={streak === 1 ? "day" : "days"}
        style={{ fontSize: 13, fontWeight: "500", color: c.textSec, paddingBottom: 5 }}
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
        justifyContent: "space-between",
      }}
    >
      <StreakBadge streak={s?.streak ?? 0} c={c} />
      <TextWidget
        text={statusLine(s)}
        style={{
          fontSize: 13,
          fontWeight: allDone ? "600" : "500",
          color: allDone ? c.accent : c.textSec,
        }}
      />
    </FlexWidget>
  );
}

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
  return (
    <FlexWidget
      style={{
        height: "match_parent",
        width: "match_parent",
        flexDirection: "row",
        flexGap: 16,
      }}
    >
      <FlexWidget style={{ flexDirection: "column" }}>
        <StreakBadge streak={s?.streak ?? 0} c={c} />
      </FlexWidget>
      <FlexWidget style={{ flex: 1, flexDirection: "column", flexGap: 6 }}>
        {habits.length === 0 ? (
          <TextWidget
            text="Tap to start today's debrief"
            style={{ fontSize: 14, fontWeight: "500", color: c.textSec }}
          />
        ) : (
          habits.map((h, i) => (
            <FlexWidget
              key={`${i}-${h.name}`}
              style={{ flexDirection: "row", alignItems: "center", flexGap: 8 }}
            >
              <TextWidget
                text={h.done ? "●" : "○"}
                style={{ fontSize: 14, color: h.done ? c.accent : c.textSec }}
              />
              <TextWidget
                text={h.name}
                maxLines={1}
                truncate="END"
                style={{ fontSize: 14, color: h.done ? c.textSec : c.text }}
              />
            </FlexWidget>
          ))
        )}
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
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: RECORD_URI }}
      accessibilityLabel="Ripple: start a check-in"
      style={{
        height: "match_parent",
        width: "match_parent",
        backgroundColor: c.bg,
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
 * theme. `width`/`height` are the widget's current size in dp.
 */
export function renderRippleWidget(
  snapshot: WidgetSnapshot | null,
  width: number,
  height: number
) {
  const s = forToday(snapshot);
  return {
    light: <Root s={s} c={LIGHT} width={width} height={height} />,
    dark: <Root s={s} c={DARK} width={width} height={height} />,
  };
}
