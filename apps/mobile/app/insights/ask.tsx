import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BackButton } from "@/components/back-button";
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
      <View style={{ padding: 20 }}>
        <BackButton onPress={() => router.back()} />
      </View>
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
          }}
        >
          Coming soon to mobile. Ask natural-language questions across
          your own journal history and get answers in your own words.
        </Text>
      </View>
    </SafeAreaView>
  );
}
