import { CloudRain, Frown, Meh, Rocket, Smile } from "lucide-react";

/**
 * Lucide icon for a mood enum value. Replaces the 🚀😊😐😔😣 emoji
 * set that used to render via MOOD_EMOJI in UI surfaces. Emoji still
 * lives in @acuity/shared for backend paths (prompts, emails) that
 * want compact ascii-ish representations; the UI no longer paints
 * them directly.
 */
export function MoodIcon({
  mood,
  size = 16,
  className,
  strokeWidth = 1.75,
}: {
  mood: string | null | undefined;
  size?: number;
  className?: string;
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
  return (
    <Icon
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden="true"
    />
  );
}
