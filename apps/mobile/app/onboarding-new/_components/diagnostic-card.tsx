import { LinearGradient } from "expo-linear-gradient";
import { Pressable, Text, View } from "react-native";

import type { AcuityTokens } from "@/lib/theme/tokens";

/**
 * Shared option card for slice 3's three diagnostic screens.
 * Unselected: cardBg with a hairline border. Selected: gradMixSoft
 * gradient tint behind the same content, primary-colored border.
 *
 * 60pt minimum height per spec. The label sits centered-left at
 * 16pt body weight; pressed state is a small dim on the wrapper.
 *
 * Tokens come in as a prop because slices 2-4 force the light
 * variant via makeAcuityTokens regardless of user appearance —
 * passing through the prop avoids re-deriving inside this leaf
 * component on every render.
 */
export function DiagnosticCard({
  label,
  selected,
  onPress,
  tokens,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  tokens: AcuityTokens;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        borderRadius: tokens.radius.lg,
        overflow: "hidden",
        borderWidth: selected ? 1 : 0.5,
        borderColor: selected ? tokens.primary : tokens.cardBorder,
        backgroundColor: selected ? "transparent" : tokens.cardBg,
        opacity: pressed ? 0.85 : 1,
        minHeight: 60,
      })}
    >
      {selected && (
        <LinearGradient
          colors={tokens.gradMixSoft.colors as unknown as readonly [string, string, ...string[]]}
          locations={tokens.gradMixSoft.locations as unknown as readonly [number, number, ...number[]]}
          start={tokens.gradMixSoft.start}
          end={tokens.gradMixSoft.end}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />
      )}
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          paddingHorizontal: 18,
          paddingVertical: 18,
        }}
      >
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 16,
            lineHeight: 22,
            fontWeight: selected ? "600" : "500",
            color: tokens.text,
          }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
