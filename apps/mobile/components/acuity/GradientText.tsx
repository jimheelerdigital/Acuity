import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { Text, View, type TextStyle } from "react-native";

/**
 * GradientText — text masked by a linear gradient.
 *
 * RN doesn't support CSS's `background-clip: text` natively. The
 * idiomatic workaround is MaskedView: render the text twice — once
 * inside a `maskElement` (defines the visible shape) and once as the
 * gradient `<LinearGradient>` that gets clipped to that shape.
 *
 * The mask Text MUST match the visible Text exactly (same font,
 * weight, size, letter-spacing) or the gradient will misalign with
 * the glyph edges. Pass the same `style` to the prop; we propagate
 * it to both layers.
 *
 * Use cases (per design):
 *   - Hero score numbers (Home / Insights)
 *   - Onboarding axis name in the question
 *   - TierPill level number
 *   - Ritual variant greeting
 *
 * Tabular nums: callers passing numeric content should include
 * `fontVariant: ['tabular-nums']` in `style` so digits don't jitter
 * during count-up animation.
 */

export interface GradientTextProps {
  /** Two-or-more color stops (hex). Maps to LinearGradient `colors`. */
  colors: readonly [string, string, ...string[]];
  /** Same start/end as expo-linear-gradient; 135° default top-left → bottom-right. */
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  /** Text style — must include fontFamily/fontSize/fontWeight at minimum. */
  style?: TextStyle;
  children: ReactNode;
}

export function GradientText({
  colors,
  start = { x: 0, y: 0 },
  end = { x: 1, y: 1 },
  style,
  children,
}: GradientTextProps) {
  return (
    <MaskedView
      maskElement={
        // The mask Text defines glyph silhouettes; color here doesn't
        // matter since only opacity is read. Black with full opacity
        // is the canonical choice — the masked LinearGradient below
        // fills these shapes.
        <View style={{ backgroundColor: "transparent" }}>
          <Text style={[style, { color: "#000000" }]}>{children}</Text>
        </View>
      }
    >
      <LinearGradient colors={colors as unknown as string[]} start={start} end={end}>
        {/* Invisible Text reserves the same layout box as the mask. */}
        <Text style={[style, { opacity: 0 }]}>{children}</Text>
      </LinearGradient>
    </MaskedView>
  );
}
