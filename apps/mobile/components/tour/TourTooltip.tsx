import { Pressable, Text, View } from "react-native";
import { useCopilot } from "react-native-copilot";

import { useTheme } from "@/contexts/theme-context";

/**
 * Tooltip card rendered above the spotlight cutout. Matches Acuity's
 * design language:
 *   - tokens.cardBg background, 14pt corner radius (parity with
 *     Security card, ConnectPlaceholderCard, etc.)
 *   - GeistMono counter "1/7" at top in textTer
 *   - Manrope_700Bold title, Manrope_400Regular body
 *   - Coral primary CTA for Next / Get started (final)
 *   - Ghost button for Skip + Previous
 *
 * react-native-copilot calls this component with its `labels` prop
 * but no other props. The walkthrough state (current step, position,
 * isLastStep) is read via the useCopilot() hook, same as DefaultUI
 * does internally.
 */
export function TourTooltip() {
  const { tokens } = useTheme();
  const {
    currentStep,
    currentStepNumber,
    totalStepsNumber,
    isFirstStep,
    isLastStep,
    goToNext,
    goToPrev,
    stop,
  } = useCopilot();

  if (!currentStep) return null;

  return (
    <View
      style={{
        backgroundColor: tokens.cardBg,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: tokens.line,
        padding: 16,
        // copilot positions this container with its own inline styles;
        // the only thing we need to do is paint a card that looks right
        // and content that reads well.
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
        {currentStepNumber}/{totalStepsNumber}
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
        {currentStep.name}
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
        {currentStep.text}
      </Text>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        {/* Skip lives on the LEFT, dimmer than Previous, so users can
            always escape regardless of step. Calling stop() routes
            through copilotEvents.emit("stop") which our orchestrator
            handles as the skip path (writes tourCompletedAt either way). */}
        <Pressable
          onPress={() => void stop()}
          accessibilityRole="button"
          accessibilityLabel="Skip tour"
          hitSlop={6}
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

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {!isFirstStep && (
            <Pressable
              onPress={() => void goToPrev()}
              accessibilityRole="button"
              accessibilityLabel="Previous step"
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: tokens.line,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: "Manrope_500Medium",
                  fontSize: 13,
                  color: tokens.textSec,
                }}
              >
                Back
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => (isLastStep ? void stop() : void goToNext())}
            accessibilityRole="button"
            accessibilityLabel={isLastStep ? "Finish tour" : "Next step"}
            style={({ pressed }) => ({
              paddingHorizontal: 18,
              paddingVertical: 9,
              borderRadius: 999,
              backgroundColor: tokens.primary,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: "Manrope_700Bold",
                fontSize: 13,
                color: "#FFFFFF",
                letterSpacing: -0.1,
              }}
            >
              {isLastStep ? "Get started" : "Next"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
