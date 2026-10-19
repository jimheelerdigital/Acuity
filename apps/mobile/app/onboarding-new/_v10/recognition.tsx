import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";

import { useTheme } from "@/contexts/theme-context";

import { CoralScreen, FunnelProgress, coralCardStyle, coralType } from "./_ui";
import { makeAcuityTokens } from "@/lib/theme/tokens";
import {
  V10_BRANCH_ORDER,
  V10_RECOGNITION_HEADLINE,
  type V10Branch,
} from "@/lib/onboarding-v10/branches";
import { trackV10 } from "@/lib/onboarding-v10/analytics";
import { markV10Started, setV10Branch } from "@/lib/onboarding-v10/state";

/**
 * Plain-language card labels, replacing the one-word titles ("The loop",
 * "The load", …) that read as cryptic. Each is the self-explanatory line
 * a user recognizes themselves in — effectively the branch's existing
 * `support` sentence promoted to lead, so the card no longer needs a
 * second line under it.
 *
 * Keys are unchanged: this is a DISPLAY override only, and every
 * downstream branch string still comes from lib/onboarding-v10/branches.ts.
 */
const V10_CARD_LABEL: Record<V10Branch, string> = {
  rumination: "I keep replaying the same things",
  overload: "Everyone's list lives in my head",
  patterns: "Same problems, same week, again",
  stuck: "Busy all day, nothing actually moves",
  mask: "Holding it together for everyone else",
  open: "I just need to talk it out",
};

/**
 * Screen 1 — Recognition (coral).
 *
 * Six cards. Tap stores the branch and AUTO-ADVANCES: spec §4 is explicit
 * that there is no Continue button and no logo. Both matter —
 *
 *   - No Continue: this is tap 1 of the two product taps to active
 *     recording (§3). A Continue button would make it three, and the
 *     two-tap path is the north-star metric's main lever.
 *   - No logo: §1 bans any brand mark before the reveal. The first thing
 *     she should recognize is herself, not us.
 *
 * "Just let me talk" is a first-class sixth option, not an escape hatch —
 * §0 lists it as a deliberate v9 addition so nobody is forced into a
 * category.
 */
export default function V10Recognition() {
  const { palette } = useTheme();
  // Screens 1-2 ignore the user's saved appearance preference by design.
  // They are now the coral marketing surface rather than the dark one;
  // `dark: true` is kept so the token set's own contrast assumptions match
  // a dark backdrop, which the coral gradient is closer to than cream.
  const tokens = makeAcuityTokens({ dark: true, accent: palette });
  const ct = coralType(tokens);

  useEffect(() => {
    void markV10Started();
    trackV10("v10_recognition_viewed");
  }, []);

  const [selected, setSelected] = useState<V10Branch | null>(null);
  const navigatedRef = useRef(false);

  const choose = (branch: V10Branch) => {
    // Ignore repeat taps during the confirmation flash.
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    // Fill the chosen card white (the confirmation the mockup shows), then
    // advance a beat later so the selection is actually seen rather than the
    // screen jumping instantly.
    setSelected(branch);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    void setV10Branch(branch);
    trackV10("v10_branch_selected", { branch });
    setTimeout(() => router.push("/onboarding-new/promise"), 240);
  };


  return (
    <CoralScreen tokens={tokens}>
      <SafeAreaView style={{ flex: 1 }}>
      <FunnelProgress step={1} total={5} tokens={tokens} />
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingTop: 48,
          paddingBottom: 32,
          justifyContent: "center",
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          accessibilityRole="header"
          style={{ ...ct.h1, marginBottom: 32 }}
        >
          {V10_RECOGNITION_HEADLINE}
        </Text>

        <View style={{ gap: 12 }}>
          {V10_BRANCH_ORDER.map((key) => {
            const isSelected = selected === key;
            return (
              <Pressable
                key={key}
                onPress={() => choose(key)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={V10_CARD_LABEL[key]}
                // OBJECT style, not a `({pressed}) => …` function: RN 0.81.5
                // here silently drops Pressable function-styles, which is what
                // made these cards render as a plain paragraph. See _ui.tsx.
                style={coralCardStyle(tokens, { selected: isSelected })}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  {/* One line, not two: the plain label already says what the
                      old `support` sentence said. Selected flips to coral
                      text on the now-white card. */}
                  <Text
                    style={[
                      ct.cardTitle,
                      isSelected && { color: tokens.primaryLo, fontFamily: tokens.fontDisplay },
                    ]}
                  >
                    {V10_CARD_LABEL[key]}
                  </Text>
                  {isSelected ? (
                    <Text
                      style={{
                        color: tokens.primaryLo,
                        fontFamily: tokens.fontDisplay,
                        fontSize: 16,
                        marginLeft: 10,
                      }}
                    >
                      ✓
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>

      </ScrollView>
      </SafeAreaView>
    </CoralScreen>
  );
}
