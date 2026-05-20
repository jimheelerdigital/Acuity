import { useMemo } from "react";
import { Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";

/**
 * BiggestMoves — "what shifted this week" sorted by |weeklyDelta|.
 *
 * Slice Q7 (2026-05-20). Data is the existing `weeklyDelta` field on
 * each life-map area (set by `memory.updateLifeMap` in
 * apps/web/src/lib/memory.ts). Positive deltas tint the row with a
 * soft palette accent; negative deltas use a muted neutral surface
 * (NOT red — keep the read non-alarming per design directive).
 *
 * Top 4 by absolute delta. Areas with null or zero delta are
 * filtered out. Returns null when there's nothing to show so the
 * caller can collapse the section.
 */

export interface BiggestMovesArea {
  id: string;
  area: string;
  name: string | null;
  weeklyDelta: number | null;
}

interface BiggestMovesProps {
  areas: BiggestMovesArea[];
  /** Maximum rows to show. Default 4 per design. */
  max?: number;
}

export function BiggestMoves({ areas, max = 4 }: BiggestMovesProps) {
  const { tokens } = useTheme();

  const moves = useMemo(() => {
    return areas
      .filter(
        (a): a is BiggestMovesArea & { weeklyDelta: number } =>
          typeof a.weeklyDelta === "number" && a.weeklyDelta !== 0
      )
      .sort((a, b) => Math.abs(b.weeklyDelta) - Math.abs(a.weeklyDelta))
      .slice(0, max);
  }, [areas, max]);

  if (moves.length === 0) return null;

  return (
    <View style={{ marginTop: 8 }}>
      <Text
        style={{
          fontFamily: tokens.fontMono,
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: tokens.textTer,
          marginBottom: 10,
        }}
      >
        Biggest moves
      </Text>
      <View style={{ gap: 8 }}>
        {moves.map((area) => {
          const isUp = area.weeklyDelta > 0;
          // Positive deltas tint the row with a soft palette accent
          // (gradMixSoft's first stop already carries the right alpha).
          // Negative deltas use bgSub — neutral, non-alarming.
          const bg = isUp
            ? tokens.gradMixSoft.colors[0]
            : tokens.bgSub;
          // Arrow color: palette primary for up, textSec for down.
          const arrowColor = isUp ? tokens.primary : tokens.textSec;
          return (
            <View
              key={area.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderRadius: tokens.radius.lg,
                backgroundColor: bg,
                borderWidth: 0.5,
                borderColor: tokens.line,
              }}
            >
              <Text
                style={{
                  flex: 1,
                  fontFamily: tokens.fontSans,
                  fontSize: 15,
                  fontWeight: "500",
                  color: tokens.text,
                }}
              >
                {area.name ?? area.area}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "baseline",
                  gap: 4,
                }}
              >
                <Text
                  style={{
                    fontFamily: tokens.fontMono,
                    fontSize: 14,
                    fontWeight: "700",
                    color: arrowColor,
                  }}
                >
                  {isUp ? "↑" : "↓"}
                </Text>
                <Text
                  style={{
                    fontFamily: tokens.fontMono,
                    fontSize: 14,
                    fontWeight: "700",
                    color: arrowColor,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {Math.abs(area.weeklyDelta)}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
