import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Mobile BackButton — circular, ~40px diameter, Lucide ChevronLeft.
 *
 * Two variants:
 *   - `<BackButton />` — inline. Place inside a scrolling container and
 *     it flows with the content. Used by a few legacy screens; new
 *     screens should prefer the sticky variant.
 *   - `<StickyBackButton />` — absolute-positioned overlay pinned to
 *     top-left of the screen. Sits above scrolling content with a
 *     subtle frosted-looking background so glyphs underneath stay
 *     legible. Use this on every detail screen so tapping back doesn't
 *     require scrolling to the top first.
 */

export function BackButton({
  onPress,
  accessibilityLabel = "Go back",
}: {
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const router = useRouter();
  const handlePress = onPress ?? (() => router.back());
  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={{
        height: 40,
        width: 40,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "rgba(30,30,46,0.8)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ChevronLeft size={20} color="#E4E4E7" />
    </Pressable>
  );
}

/**
 * Absolute-positioned BackButton that stays pinned at the top-left as
 * content scrolls underneath it. Use this on detail screens where the
 * inline button would scroll away.
 *
 * Implementation notes:
 *   - `position: absolute` on the wrapping View so the button is laid
 *     out outside the normal flex flow; scrolling content passes
 *     underneath.
 *   - `top` equals the device's safe-area top inset plus a small
 *     constant so the button sits below the status bar / notch on all
 *     iPhones.
 *   - The button's own background is ~90% opaque so content showing
 *     through stays legible (prior sessions in the repo deliberately
 *     avoided `expo-blur` BlurView because iOS blur layers interact
 *     weirdly with Reanimated transforms on a few screens — a slightly
 *     opaque pill is the pragmatic choice).
 *   - z-index at 100 so it wins against any SVG / Reanimated layer in
 *     the content that might try to render above it.
 *
 * The parent screen MUST provide top padding in its ScrollView's
 * `contentContainerStyle` to clear the button's position (roughly
 * 56pt of paddingTop at the ScrollView level, which leaves a gap
 * between the button and the first content row).
 */
export function StickyBackButton({
  onPress,
  accessibilityLabel = "Go back",
  offsetLeft = 16,
  offsetTopExtra = 8,
}: {
  onPress?: () => void;
  accessibilityLabel?: string;
  offsetLeft?: number;
  offsetTopExtra?: number;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const handlePress = onPress ?? (() => router.back());
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: insets.top + offsetTopExtra,
        left: offsetLeft,
        zIndex: 100,
        elevation: 100,
      }}
    >
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={8}
        style={{
          height: 40,
          width: 40,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.1)",
          backgroundColor: "rgba(11,11,18,0.88)",
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowRadius: 12,
          shadowOpacity: 0.3,
        }}
      >
        <ChevronLeft size={20} color="#E4E4E7" />
      </Pressable>
    </View>
  );
}
