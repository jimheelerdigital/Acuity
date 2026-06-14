import * as Sentry from "@sentry/react-native";
import { type RenderProps } from "react-native-spotlight-tour";
import { Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { useTheme } from "@/contexts/theme-context";
import { type TourStepContent } from "./steps";

// Build-67/68 instrumentation: prove whether the tour ever reaches the
// tooltip render path. If "tour.start.called" appears in Sentry but this
// does NOT, the overlay started but couldn't position/measure a step.
// With copilot (legacy findNodeHandle) this never fired under Fabric;
// with spotlight-tour (measureInWindow) it should. Fires once per launch.
let tooltipRenderLogged = false;

/**
 * Tooltip card rendered above the spotlight cutout. Matches Acuity's
 * design language (tokens.cardBg, 14pt radius, GeistMono counter,
 * Manrope title/body, coral primary CTA, ghost Skip/Back).
 *
 * react-native-spotlight-tour calls each step's `render` with
 * {@link RenderProps}; TourProvider also passes the step `content` +
 * `total` count. (Copilot read this via useCopilot(); spotlight passes
 * it as props instead.)
 */
/**
 * Chevron rendered as an SVG path rather than an @expo/vector-icons glyph.
 * Icon-FONT glyphs intermittently fail to render inside spotlight-tour's
 * Android <Modal> (the icon font isn't flushed to the Modal's separate
 * window), which dropped the Next/Back arrows on Android while iOS showed
 * them with identical code. SVG has no font dependency and renders in this
 * exact overlay on both platforms — spotlight-tour draws its own spotlight
 * cutout with react-native-svg in the same Modal.
 */
function Chevron({
  direction,
  size,
  color,
}: {
  direction: "left" | "right";
  size: number;
  color: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={direction === "right" ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"}
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function TourTooltip(
  props: RenderProps & { content: TourStepContent; total: number }
) {
  if (!tooltipRenderLogged) {
    tooltipRenderLogged = true;
    Sentry.captureMessage("tour.tooltip.rendered", "info");
  }
  const { tokens } = useTheme();
  const { current, isFirst, isLast, next, previous, stop, content, total } =
    props;

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
          color: tokens.textTer,
          marginBottom: 8,
        }}
      >
        {current + 1}/{total}
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
        {content.title}
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
        {content.text}
      </Text>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        {/* Skip on the LEFT, dimmer, so users can always escape. stop()
            triggers the provider's onStop, which our orchestrator treats
            as the skip path (writes tourCompletedAt either way). */}
        <Pressable
          onPress={() => stop()}
          accessibilityRole="button"
          accessibilityLabel="Skip tour"
          hitSlop={{ top: 16, bottom: 16, left: 12, right: 16 }}
        >
          <Text
            style={{
              fontFamily: "Manrope_500Medium",
              fontSize: 13,
              color: tokens.textTer,
            }}
          >
            Skip
          </Text>
        </Pressable>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 20 }}>
          {!isFirst && (
            <Pressable
              onPress={() => previous()}
              accessibilityRole="button"
              accessibilityLabel="Previous step"
              style={({ pressed }) => ({
                minHeight: 50,
                minWidth: 50,
                paddingHorizontal: 14,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                borderWidth: 1,
                borderColor: tokens.line,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Chevron direction="left" size={18} color={tokens.textSec} />
            </Pressable>
          )}

          <Pressable
            onPress={() => (isLast ? stop() : next())}
            accessibilityRole="button"
            accessibilityLabel={isLast ? "Finish tour" : "Next step"}
            style={({ pressed }) => ({
              minHeight: 50,
              minWidth: 50,
              paddingHorizontal: 18,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 999,
              backgroundColor: tokens.primary,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            {isLast ? (
              <Text
                style={{
                  fontFamily: "Manrope_700Bold",
                  fontSize: 13,
                  color: "#FFFFFF",
                  letterSpacing: -0.1,
                }}
              >
                Get started
              </Text>
            ) : (
              <Chevron direction="right" size={18} color="#FFFFFF" />
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}
