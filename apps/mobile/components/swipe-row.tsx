import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";

import { useTheme } from "@/contexts/theme-context";
import { fireHaptic } from "@/lib/haptics";

/**
 * One swipe behavior for every list row (goals, habits, tasks) — 1.9.1.
 *
 *   - swipe left reveals Edit + Delete
 *   - only one row is open at a time: starting to open another row
 *     closes the previous one
 *   - each button tap fires a haptic (respects Appearance → Haptics)
 *   - Delete never deletes directly: `onDelete` must show a confirm.
 *     The row closes first so it isn't left half-open behind the Alert.
 *
 * `variant`:
 *   - "card":  rows that are separate rounded cards (goals, habits).
 *              Buttons are rounded tiles beside the card.
 *   - "flush": full-width rows inside a list (tasks). Buttons are
 *              full-height squares flush with the row edge.
 */

// The single open row, shared across every list on screen.
let openRow: Swipeable | null = null;

// The row the What's New tour uses to demo the swipe (first task row).
let tourDemoRow: Swipeable | null = null;

/** What's New tour: slide the demo row open to show Edit / Delete. */
export function peekTourDemoRow(): void {
  const row = tourDemoRow;
  if (!row) return;
  if (openRow && openRow !== row) openRow.close();
  openRow = row;
  row.openRight();
}

/** Close whichever row is open (call on scroll / screen blur if wanted). */
export function closeOpenSwipeRow(): void {
  openRow?.close();
  openRow = null;
}

export function SwipeRow({
  children,
  onEdit,
  onDelete,
  itemName,
  variant = "card",
  radius = 12,
  enabled = true,
  tourDemo = false,
}: {
  children: ReactNode;
  onEdit: () => void;
  /** Must confirm before deleting. */
  onDelete: () => void;
  /** Used in accessibility labels ("Edit <name>"). */
  itemName: string;
  variant?: "card" | "flush";
  radius?: number;
  enabled?: boolean;
  /** This row is the one the What's New tour slides open as a demo. */
  tourDemo?: boolean;
}) {
  const { tokens } = useTheme();
  const ref = useRef<Swipeable | null>(null);

  // Forget this row if it unmounts while open (e.g. it was deleted).
  useEffect(
    () => () => {
      if (openRow && openRow === ref.current) openRow = null;
    },
    []
  );

  useEffect(() => {
    if (!tourDemo) return;
    tourDemoRow = ref.current;
    return () => {
      if (tourDemoRow === ref.current) tourDemoRow = null;
    };
  }, [tourDemo]);

  const claimOpen = useCallback(() => {
    const self = ref.current;
    if (openRow && openRow !== self) openRow.close();
    openRow = self;
  }, []);

  const released = useCallback(() => {
    if (openRow === ref.current) openRow = null;
  }, []);

  const handleEdit = useCallback(() => {
    fireHaptic("light");
    ref.current?.close();
    onEdit();
  }, [onEdit]);

  const handleDelete = useCallback(() => {
    fireHaptic("medium");
    ref.current?.close();
    onDelete();
  }, [onDelete]);

  // NOTE: static style objects only. NativeWind's Pressable interop drops
  // function-form styles (`style={({ pressed }) => …}`) — the 1.9.1 What's
  // New sheet lost its row layout that way. The rest of the app avoids it.
  const card = variant === "card";
  const buttonBase = {
    width: card ? 76 : 80,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    ...(card ? { borderRadius: radius, marginLeft: 8 } : null),
  };

  const renderRightActions = () => (
    <View style={{ flexDirection: "row", alignItems: "stretch" }}>
      <Pressable
        onPress={handleEdit}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${itemName}`}
        style={{ ...buttonBase, backgroundColor: tokens.bgInset }}
      >
        <Ionicons name="pencil" size={18} color={tokens.textSec} />
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 12,
            color: tokens.textSec,
            marginTop: 4,
          }}
        >
          Edit
        </Text>
      </Pressable>
      <Pressable
        onPress={handleDelete}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${itemName}`}
        style={{ ...buttonBase, backgroundColor: tokens.bad }}
      >
        <Ionicons name="trash" size={18} color="#ffffff" />
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 12,
            color: "#ffffff",
            marginTop: 4,
          }}
        >
          Delete
        </Text>
      </Pressable>
    </View>
  );

  if (!enabled) return <>{children}</>;

  return (
    <Swipeable
      ref={ref}
      renderRightActions={renderRightActions}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      onSwipeableOpenStartDrag={claimOpen}
      onSwipeableWillOpen={claimOpen}
      onSwipeableClose={released}
    >
      {children}
    </Swipeable>
  );
}
