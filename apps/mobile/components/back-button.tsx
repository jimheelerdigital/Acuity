import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { Pressable } from "react-native";

/**
 * Mobile BackButton — circular, ~40px diameter, Lucide ChevronLeft.
 * Replaces the text "← Parent" back links scattered across detail
 * screens. Tap = router.back() by default; caller can override for
 * cases where a specific destination is required.
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
