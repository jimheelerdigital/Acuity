import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { StickyBackButton } from "@/components/back-button";
import { useTheme } from "@/contexts/theme-context";

export default function AskPastSelfScreen() {
  const router = useRouter();
  const { resolved } = useTheme();
  const isDark = resolved === "dark";
  return (
    <SafeAreaView
      edges={["top"]}
      style={{ flex: 1, backgroundColor: isDark ? "#0B0B12" : "#FFFFFF" }}
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
        <Text
          style={{
            fontSize: 12,
            fontWeight: "600",
            textTransform: "uppercase",
            letterSpacing: 2,
            color: "#818CF8",
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
            color: isDark ? "#FAFAFA" : "#18181B",
          }}
        >
          Ask Your Past Self
        </Text>
        <Text
          style={{
            fontSize: 16,
            lineHeight: 24,
            textAlign: "center",
            color: isDark ? "#A1A1AA" : "#71717A",
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
            backgroundColor: "#7C3AED",
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
