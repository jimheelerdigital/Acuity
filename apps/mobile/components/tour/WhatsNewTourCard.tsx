import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";

import { closeOpenSwipeRow, peekTourDemoRow } from "@/components/swipe-row";
import { useTheme } from "@/contexts/theme-context";
import { fireHaptic } from "@/lib/haptics";

import type { WhatsNewTourCard as Card } from "./whats-new-tour";

/**
 * Tooltip for What's New tour stops (1.9.1). Same look as TourTooltip
 * (static styles only — NativeWind drops function-form Pressable styles).
 *
 * Full tour: "What's new · 2 of 6", Back / Next, Skip.
 * Single stop (an item tapped from the list): "Back to What's New" + Done.
 */
export function WhatsNewTourCard({
  card,
  at,
  count,
  single,
  onNext,
  onBack,
  onSkip,
  onBackToList,
}: {
  card: Card;
  at: number;
  count: number;
  single: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onBackToList: () => void;
}) {
  const { tokens } = useTheme();
  const isFirst = at === 0;
  const isLast = at === count - 1;

  // Swipe stop: slide the spotlit task row open so the Edit / Delete
  // buttons are visible, then close it when the card goes away.
  useEffect(() => {
    if (!card.peekSwipe) return;
    const t = setTimeout(() => peekTourDemoRow(), 650);
    return () => {
      clearTimeout(t);
      closeOpenSwipeRow();
    };
  }, [card.peekSwipe, card.target]);

  const primaryLabel = single ? "Done" : isLast ? "Finish" : "Next";

  return (
    <View
      style={{
        backgroundColor: tokens.cardBg,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: tokens.line,
        padding: 16,
        maxWidth: 320,
      }}
    >
      <Text
        style={{
          fontFamily: "GeistMono_500Medium",
          fontSize: 11,
          letterSpacing: 1.4,
          color: tokens.primary,
          marginBottom: 8,
          textTransform: "uppercase",
        }}
      >
        {single ? "What's new" : `What's new · ${at + 1} of ${count}`}
      </Text>
      <Text
        style={{
          fontFamily: "Manrope_700Bold",
          fontSize: 17,
          color: tokens.text,
          marginBottom: 6,
          letterSpacing: -0.2,
        }}
      >
        {card.title}
      </Text>
      <Text
        style={{
          fontFamily: "Manrope_400Regular",
          fontSize: 14,
          lineHeight: 20,
          color: tokens.textSec,
          marginBottom: 14,
        }}
      >
        {card.body}
      </Text>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <Pressable
          onPress={() => (single ? onBackToList() : onSkip())}
          accessibilityRole="button"
          accessibilityLabel={single ? "Back to What's New" : "Skip"}
          hitSlop={{ top: 16, bottom: 16, left: 12, right: 16 }}
        >
          <Text style={{ fontFamily: "Manrope_500Medium", fontSize: 13, color: tokens.textTer }}>
            {single ? "‹ Back to What's New" : "Skip"}
          </Text>
        </Pressable>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {!single && !isFirst ? (
            <Pressable
              onPress={() => {
                fireHaptic("light");
                onBack();
              }}
              accessibilityRole="button"
              accessibilityLabel="Previous"
              style={{
                minHeight: 44,
                minWidth: 44,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                borderWidth: 1,
                borderColor: tokens.line,
              }}
            >
              <Ionicons name="chevron-back" size={18} color={tokens.textSec} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => {
              fireHaptic("light");
              onNext();
            }}
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
            style={{
              minHeight: 44,
              paddingHorizontal: 18,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 999,
              backgroundColor: tokens.primary,
            }}
          >
            <Text style={{ fontFamily: "Manrope_700Bold", fontSize: 14, color: "#FFFFFF" }}>
              {primaryLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
