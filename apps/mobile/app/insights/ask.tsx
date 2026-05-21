import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { StickyBackButton } from "@/components/back-button";
import { useTheme } from "@/contexts/theme-context";

export default function AskPastSelfScreen() {
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
        {/* "Ask" surface is secondary-tinted to differentiate it from
            the primary-tinted Theme Map and Life Matrix cards on the
            parent Insights tab. Same convention as Q11c-2's
            Ask-your-past-self CTA card. */}
        <Text
          style={{
            fontSize: 12,
            fontWeight: "600",
            textTransform: "uppercase",
            letterSpacing: 2,
            color: tokens.secondary,
            marginBottom: 12,
          }}
        >
          Ask
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
          Ask Your Past Self
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
          Coming soon to mobile. Available on the web today — ask
          natural-language questions across your journal history and
          get answers in your own words.
        </Text>
        <Pressable
          onPress={() =>
            WebBrowser.openBrowserAsync("https://getacuity.io/insights/ask")
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
