import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, Text, View } from "react-native";

import { TierPill } from "@/components/acuity";
import { useTheme } from "@/contexts/theme-context";

/**
 * IdentityHero — top-of-Home identity surface.
 *
 * Renders avatar (gradient circle with initial) + greeting eyebrow +
 * first-name display. Optional settings cog on the right (opens
 * Profile tab; matches the current Home's settings-icon affordance
 * — preserved for navigation parity).
 *
 * TierPill: derived from `currentStreak` since the design's `tier`
 * data isn't on the current /api/user/me payload. Crossings at
 * 7/14/30/60/100 days flip the tier label so the user sees
 * progression without needing a new endpoint. If/when a real tier
 * field lands, swap the derivation for the server value.
 */

interface IdentityHeroProps {
  initials: string;
  greeting: string;
  firstName: string;
  /** Optional — derives a tier name from streak count if provided. */
  currentStreak?: number;
  /** Called when user taps the settings cog. */
  onSettingsPress?: () => void;
}

interface TierInfo {
  level: number;
  name: string;
}

function tierFor(streak: number): TierInfo {
  if (streak >= 100) return { level: 6, name: "Centurion" };
  if (streak >= 60) return { level: 5, name: "Devoted" };
  if (streak >= 30) return { level: 4, name: "Reflective" };
  if (streak >= 14) return { level: 3, name: "Steady" };
  if (streak >= 7) return { level: 2, name: "Building" };
  return { level: 1, name: "Starting" };
}

export function IdentityHero({
  initials,
  greeting,
  firstName,
  currentStreak = 0,
  onSettingsPress,
}: IdentityHeroProps) {
  const { tokens } = useTheme();
  const tier = tierFor(currentStreak);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      {/* Avatar — 44px gradient circle with initial. The 1.5px white-
          tint border is the design's separation cue against hero
          backgrounds. */}
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          overflow: "hidden",
          borderWidth: 1.5,
          borderColor: "#ffffff26",
        }}
      >
        <LinearGradient
          colors={tokens.gradMix.colors}
          start={tokens.gradMix.start}
          end={tokens.gradMix.end}
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontFamily: tokens.fontDisplay,
              fontSize: 17,
              fontWeight: "700",
              letterSpacing: -0.3,
              color: "#ffffff",
            }}
          >
            {initials}
          </Text>
        </LinearGradient>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 13,
            letterSpacing: -0.1,
            color: tokens.textTer,
          }}
        >
          {greeting},
        </Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 22,
            fontWeight: "700",
            letterSpacing: -0.4,
            lineHeight: 26,
            color: tokens.text,
          }}
        >
          {firstName}.
        </Text>
        <View style={{ marginTop: 6 }}>
          <TierPill level={tier.level} name={tier.name} />
        </View>
      </View>

      {onSettingsPress && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          onPress={onSettingsPress}
          hitSlop={12}
          style={{
            width: 44,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 22,
            borderWidth: 0.5,
            borderColor: tokens.line,
            backgroundColor: tokens.cardBg,
          }}
        >
          <Ionicons name="settings-outline" size={18} color={tokens.textSec} />
        </Pressable>
      )}
    </View>
  );
}
