import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";
import { useHaptics } from "@/lib/haptics";

/**
 * Haptics toggle row (Slice Q2, 2026-05-19).
 *
 * Visual: setting-row layout with a label + sub-line on the left and
 * a switch on the right. Matches the rest of the Preferences group's
 * new visual grammar (rounded card, hairline border, padded).
 *
 * Behavior: tapping the row OR the switch flips the preference.
 * Toggling ON fires a confirming light tap so the user feels what
 * they just enabled (handled in useHaptics().setEnabled).
 *
 * Copy locked: "Haptic feedback" + "Subtle vibration on task complete
 * and celebrations." per the updated README spec.
 */

export function HapticsRow() {
  const { tokens } = useTheme();
  const { enabled, setEnabled } = useHaptics();

  return (
    <Pressable
      onPress={() => setEnabled(!enabled)}
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        borderRadius: tokens.radius.lg,
        backgroundColor: tokens.cardBg,
        borderWidth: 1,
        borderColor: tokens.cardBorder,
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 15,
            fontWeight: "500",
            color: tokens.text,
          }}
        >
          Haptic feedback
        </Text>
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 13,
            fontWeight: "400",
            color: tokens.textTer,
          }}
        >
          Subtle vibration on task complete and celebrations.
        </Text>
      </View>
      <Switch
        on={enabled}
        onColor={tokens.primary}
        offColor={tokens.bgInset}
        knobColor="#ffffff"
      />
    </Pressable>
  );
}

interface SwitchProps {
  on: boolean;
  onColor: string;
  offColor: string;
  knobColor: string;
}

function Switch({ on, onColor, offColor, knobColor }: SwitchProps) {
  // Hand-rolled to match the design's track/knob proportions exactly
  // (RN Switch has different sizing on iOS vs Android and won't
  // honor the token surfaces in light mode cleanly). Pure visual —
  // the parent Pressable owns the tap-to-toggle behavior.
  return (
    <View
      pointerEvents="none"
      style={{
        width: 48,
        height: 28,
        borderRadius: 999,
        backgroundColor: on ? onColor : offColor,
        justifyContent: "center",
        paddingHorizontal: 2,
      }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 999,
          backgroundColor: knobColor,
          transform: [{ translateX: on ? 20 : 0 }],
        }}
      />
    </View>
  );
}
