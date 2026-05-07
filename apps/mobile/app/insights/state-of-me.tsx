import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { StickyBackButton } from "@/components/back-button";
import { useTheme } from "@/contexts/theme-context";

export default function StateOfMeScreen() {
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
            color: "#FBBF24",
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
            color: isDark ? "#FAFAFA" : "#18181B",
          }}
        >
          State of Me
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
          Your quarterly State of Me report — coming soon to mobile.
          Every 90 days, Acuity writes a long-form read across the
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
