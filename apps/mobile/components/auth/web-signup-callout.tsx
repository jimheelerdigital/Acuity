import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

/**
 * "Just signed up on the website?" callout, shown above the Apple / Google
 * buttons (2026-10-07, per Keenan). People who pay in the web funnel then
 * open the app and tap Sign in with Apple, which creates a second, empty
 * account (Apple hides their email), so their membership doesn't show.
 * This steers them to the email they used on the website.
 */
export function WebSignupCallout({ tokens }: { tokens: { text: string; textSec: string; primary: string; line: string; cardBg: string } }) {
  return (
    <View
      className="w-full flex-row gap-3 rounded-xl border px-4 py-3 mb-4"
      style={{ borderColor: tokens.primary, backgroundColor: tokens.cardBg }}
    >
      <Ionicons name="information-circle" size={20} color={tokens.primary} />
      <View className="flex-1">
        <Text className="text-sm font-semibold" style={{ color: tokens.text }} maxFontSizeMultiplier={1.3}>
          Just signed up on our website?
        </Text>
        <Text className="mt-0.5 text-sm leading-snug" style={{ color: tokens.textSec }} maxFontSizeMultiplier={1.3}>
          Sign in with the email you used there (below), not Apple or Google, so your membership shows up.
        </Text>
      </View>
    </View>
  );
}
