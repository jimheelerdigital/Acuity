import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { StickyBackButton } from "@/components/back-button";
import { useTheme } from "@/contexts/theme-context";
import { WARN_AMBER } from "@/lib/tone-colors";

export default function StateOfMeScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  return (
    <SafeAreaView
      edges={["top"]}
      style={{ flex: 1, backgroundColor: tokens.bg }}
    >
      <StickyBackButton onPress={() => router.back()} />
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 32,
        }}
      >
        {/* "Quarterly" eyebrow stays warning-amber — deliberate
            non-palette accent (same exception convention as ON_HOLD
            goals, Q11c-2 State of Me Insights card, Q11c-3 task due
            dates, Q11c-4 PARTIAL entry badge, Q8 confetti). */}
        <Text
          style={{
            fontSize: 12,
            fontWeight: "600",
            textTransform: "uppercase",
            letterSpacing: 2,
            color: WARN_AMBER,
            marginBottom: 12,
          }}
        >
          Quarterly
        </Text>
        <Text
          style={{
            fontSize: 24,
            fontWeight: "700",
            textAlign: "center",
            marginBottom: 12,
            color: tokens.text,
          }}
        >
          State of Me
        </Text>
        <Text
          style={{
            fontSize: 16,
            lineHeight: 24,
            textAlign: "center",
            color: tokens.textSec,
            marginBottom: 24,
          }}
        >
          Your quarterly State of Me report — coming soon to mobile.
          Every 90 days, Ripple writes a long-form read across the
          quarter: themes, mood arc, patterns worth noticing.
          Available on the web today.
        </Text>
        <Pressable
          onPress={() =>
            WebBrowser.openBrowserAsync(
              "https://getacuity.io/insights/state-of-me"
            )
          }
          style={{
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 999,
            backgroundColor: tokens.primary,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: "#FFFFFF",
              letterSpacing: 0.2,
            }}
          >
            Open on web
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
