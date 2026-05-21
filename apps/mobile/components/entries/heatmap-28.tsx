import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import type { EntryDTO } from "@acuity/shared";

import { useTheme } from "@/contexts/theme-context";

/**
 * Heatmap28 — 4-row × 7-column grid of the last 28 nights.
 *
 * Slice Q8 (2026-05-20). Pure derived view — no new API calls. Cells
 * are tinted palette intensity based on whether an entry exists on
 * that local date. Tap navigates to the entry; tapping an empty
 * cell is a no-op.
 *
 * Layout: oldest (28 days ago) at top-left, newest (today) at
 * bottom-right. Each row is a calendar week's worth of days in
 * reading order, but rows are sliding 7-day windows back from today
 * — not strictly calendar-aligned weeks. This matches the design
 * canvas (Entries screen § 28-night heatmap).
 *
 * Intensity: cells with an entry use the palette primary at
 * decreasing alpha as they get older (newest = highest contrast).
 * Today's cell uses the gradMix's first stop for a slightly warmer
 * accent. Empty cells use bgInset so they read as "off" without
 * disappearing entirely.
 */

const ROWS = 4;
const COLS = 7;
const TOTAL_CELLS = ROWS * COLS;

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface Heatmap28Props {
  entries: EntryDTO[];
  onEntryPress: (entryId: string) => void;
}

export function Heatmap28({ entries, onEntryPress }: Heatmap28Props) {
  const { tokens } = useTheme();

  // Compute a date-keyed map of entries → ids. If a day has multiple
  // entries, we surface the most recent (entries arriving newest-first
  // overwrite older ones in the map).
  const entryByDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of entries) {
      const key = ymd(new Date(e.createdAt));
      if (!map.has(key)) map.set(key, e.id);
    }
    return map;
  }, [entries]);

  const cells = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Generate 28 cells, oldest first. age 27 = today, age 0 = 27d ago.
    return Array.from({ length: TOTAL_CELLS }, (_, idx) => {
      const age = TOTAL_CELLS - 1 - idx; // newest at end
      const d = new Date(today);
      d.setDate(today.getDate() - age);
      const dateKey = ymd(d);
      const entryId = entryByDate.get(dateKey) ?? null;
      return {
        idx,
        age,
        isToday: age === 0,
        entryId,
        dateKey,
      };
    });
  }, [entryByDate]);

  const totalEntries = cells.filter((c) => c.entryId !== null).length;

  return (
    <View
      style={{
        borderRadius: tokens.radius.lg,
        backgroundColor: tokens.cardBg,
        borderWidth: 0.5,
        borderColor: tokens.line,
        padding: 16,
        gap: 12,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{
            fontFamily: tokens.fontMono,
            fontSize: 10,
            fontWeight: "700",
            letterSpacing: 1.4,
            textTransform: "uppercase",
            color: tokens.textTer,
          }}
        >
          Last 28 nights
        </Text>
        <Text
          style={{
            fontFamily: tokens.fontMono,
            fontSize: 11,
            fontWeight: "600",
            color: tokens.textSec,
          }}
        >
          {totalEntries} recorded
        </Text>
      </View>
      <View style={{ gap: 6 }}>
        {Array.from({ length: ROWS }).map((_, rowIdx) => (
          <View key={rowIdx} style={{ flexDirection: "row", gap: 6 }}>
            {cells.slice(rowIdx * COLS, (rowIdx + 1) * COLS).map((cell) => {
              // Intensity ramps with recency for cells that have an
              // entry — newest 7 days at full alpha, then decay.
              const ageNorm = 1 - cell.age / TOTAL_CELLS;
              const alpha = cell.entryId
                ? cell.isToday
                  ? "ff"
                  : Math.max(
                      0x33,
                      Math.round(0x33 + ageNorm * (0xee - 0x33))
                    )
                      .toString(16)
                      .padStart(2, "0")
                : null;
              const bg = cell.entryId
                ? cell.isToday
                  ? tokens.gradMix.colors[0]
                  : `${tokens.primary}${alpha}`
                : tokens.bgInset;
              return (
                <Pressable
                  key={cell.idx}
                  disabled={!cell.entryId}
                  onPress={() =>
                    cell.entryId ? onEntryPress(cell.entryId) : null
                  }
                  style={{
                    flex: 1,
                    aspectRatio: 1,
                    borderRadius: 6,
                    backgroundColor: bg,
                    borderWidth: cell.isToday ? 1 : 0,
                    borderColor: cell.isToday ? tokens.text : "transparent",
                  }}
                  accessibilityLabel={
                    cell.entryId
                      ? `Entry on ${cell.dateKey}`
                      : `No entry on ${cell.dateKey}`
                  }
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
