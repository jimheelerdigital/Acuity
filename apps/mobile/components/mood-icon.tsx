import { CloudRain, Frown, Meh, Rocket, Smile } from "lucide-react-native";

/**
 * Mobile counterpart to apps/web/src/components/mood-icon.tsx.
 * Same mood→icon mapping; different import source.
 */
export function MoodIcon({
  mood,
  size = 16,
  color,
  strokeWidth = 1.75,
}: {
  mood: string | null | undefined;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const Icon =
    mood === "GREAT"
      ? Rocket
      : mood === "GOOD"
        ? Smile
        : mood === "LOW"
          ? Frown
          : mood === "ROUGH"
            ? CloudRain
            : Meh;
  return <Icon size={size} color={color} strokeWidth={strokeWidth} />;
}
