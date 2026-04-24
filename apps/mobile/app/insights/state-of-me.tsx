import { useRouter } from "expo-router";
import { Text, View } from "react-native";
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
          }}
        >
          Your quarterly State of Me report — coming soon. Every 90
          days, Acuity will write a long-form read across the
          quarter: themes, mood arc, patterns worth noticing.
        </Text>
      </View>
    </SafeAreaView>
  );
}
