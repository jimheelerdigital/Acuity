import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { DEFAULT_LIFE_AREAS } from "@acuity/shared";

import { useTheme } from "@/contexts/theme-context";

import { useOnboarding } from "./context";

/**
 * Step 7 — Top-3 life-area ranking. Same data shape as the web step 6
 * ({ CAREER: 1, MONEY: 2, PHYSICAL_HEALTH: 3 }, etc.) so the Life
 * Matrix seeding logic downstream works without a mobile-specific
 * branch.
 *
 * Phase D (2026-05-21): top-3 picker over the canonical 10 axes.
 * Server-side /api/onboarding/update now accepts both 10-axis (build-
 * 43+) and 6-axis (build-42) priorities. Phase C will replace this
 * entire step with a 12-axis baseline slider adapted to 10 axes;
 * until then this top-3-of-10 picker is the transitional step.
 *
 * Interaction: tap an area to add it. The first tap marks it "1",
 * second "2", third "3". Re-tap a ranked area to unselect, which
 * collapses the higher-ranked picks up one slot. Continue is gated
 * on exactly 3 picks.
 *
 * The "OTHER" freeform input handler from V1 is removed — the 10-axis
 * schema has no OTHER catch-all; PURPOSE absorbs the long-arc bucket.
 */

export function Step7LifeAreas() {
  const { step, setCanContinue, setCapturedData, getCapturedData } =
    useOnboarding();
  const { tokens } = useTheme();
  // Rehydrate ordered picks from prior captured priorities (rank 1 first).
  const prior = getCapturedData(step) as
    | {
        lifeAreaPriorities?: Record<string, number>;
        lifeAreaOtherText?: string | null;
      }
    | null;
  const [picks, setPicks] = useState<string[]>(() => {
    const map = prior?.lifeAreaPriorities;
    if (!map) return [];
    return Object.entries(map)
      .sort(([, a], [, b]) => a - b)
      .map(([k]) => k)
      .slice(0, 3);
  });
  const [otherText, setOtherText] = useState<string>(
    () => prior?.lifeAreaOtherText ?? ""
  );

  const otherSelected = picks.includes("OTHER");

  useEffect(() => {
    // Continue is gated on exactly 3 picks. The "Other" text is
    // optional — empty string is fine; user can leave it blank.
    setCanContinue(picks.length === 3);
    if (picks.length === 0) {
      setCapturedData(null);
      return;
    }
    const priorities: Record<string, number> = {};
    picks.forEach((area, i) => {
      priorities[area] = i + 1;
    });
    setCapturedData({
      lifeAreaPriorities: priorities,
      // Only persist the text when OTHER is actually one of the picks;
      // otherwise null so a previously-typed value gets cleared if the
      // user unselected OTHER on a back-nav round-trip.
      lifeAreaOtherText: otherSelected ? otherText.trim() || null : null,
    });
  }, [picks, otherText, otherSelected, setCanContinue, setCapturedData]);

  const toggle = (enumKey: string) => {
    setPicks((prev) => {
      const idx = prev.indexOf(enumKey);
      if (idx >= 0) return prev.filter((x) => x !== enumKey);
      if (prev.length >= 3) return prev;
      return [...prev, enumKey];
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <Text
        style={{
          fontFamily: tokens.fontDisplay,
          fontSize: 28,
          fontWeight: "700",
          letterSpacing: -0.5,
          color: tokens.text,
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        What matters most?
      </Text>
      <Text
        style={{
          marginTop: 12,
          fontFamily: tokens.fontSans,
          fontSize: 15,
          lineHeight: 22,
          color: tokens.textSec,
        }}
      >
        Pick three. The order matters — these become the lens your
        weekly insights are read through.
      </Text>

      <View style={{ marginTop: 24, gap: 8 }}>
        {DEFAULT_LIFE_AREAS.map((area) => {
          const rank = picks.indexOf(area.enum);
          const selected = rank >= 0;
          // Phase D dropped the OTHER catch-all; left as `false` so
          // the V1 freeform input never renders. Will be removed
          // entirely when Phase C replaces this step.
          const isOther = false;
          return (
            <View key={area.enum}>
              <Pressable
                onPress={() => toggle(area.enum)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  borderRadius: tokens.radius.lg,
                  borderWidth: selected ? 1 : 0.5,
                  borderColor: selected ? tokens.primary : tokens.line,
                  backgroundColor: selected ? tokens.cardBgTint : tokens.cardBg,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                }}
              >
                {/* Rank chip — gradient on selected, hairline ring on idle. */}
                <View
                  style={{
                    height: 32,
                    width: 32,
                    borderRadius: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    borderWidth: selected ? 0 : 1,
                    borderColor: selected ? "transparent" : tokens.line,
                  }}
                >
                  {selected ? (
                    <>
                      <LinearGradient
                        colors={tokens.gradPrimary.colors}
                        locations={tokens.gradPrimary.locations}
                        start={tokens.gradPrimary.start}
                        end={tokens.gradPrimary.end}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                        }}
                      />
                      <Text
                        style={{
                          fontFamily: tokens.fontMono,
                          fontSize: 13,
                          fontWeight: "700",
                          color: "#ffffff",
                        }}
                      >
                        {rank + 1}
                      </Text>
                    </>
                  ) : (
                    <Ionicons
                      name="ellipse-outline"
                      size={14}
                      color={tokens.textTer}
                    />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: tokens.fontMono,
                      fontSize: 13,
                      fontWeight: "600",
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                      color: selected ? tokens.text : tokens.textSec,
                    }}
                  >
                    {area.name}
                  </Text>
                </View>
                {selected && (
                  <Ionicons
                    name="checkmark"
                    size={18}
                    color={tokens.primary}
                  />
                )}
              </Pressable>

              {/* Other → optional freeform input. Doesn't block
                  Continue if left blank. */}
              {isOther && selected && (
                <TextInput
                  value={otherText}
                  onChangeText={setOtherText}
                  maxLength={120}
                  placeholder="What's the other area? (optional)"
                  placeholderTextColor={tokens.textTer}
                  style={{
                    marginTop: 8,
                    marginLeft: 44,
                    marginRight: 8,
                    borderRadius: tokens.radius.md,
                    borderWidth: 0.5,
                    borderColor: tokens.line,
                    backgroundColor: tokens.cardBg,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    fontFamily: tokens.fontSans,
                    fontSize: 13,
                    color: tokens.text,
                  }}
                  accessibilityLabel="Describe your other life area"
                  returnKeyType="done"
                />
              )}
            </View>
          );
        })}
      </View>

      <Text
        style={{
          marginTop: 24,
          fontFamily: tokens.fontMono,
          fontSize: 10,
          fontWeight: "600",
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: tokens.textTer,
        }}
      >
        {picks.length === 0
          ? "Tap three in order of importance."
          : picks.length < 3
            ? `${3 - picks.length} to go.`
            : "All set — tap Continue."}
      </Text>
    </View>
  );
}
