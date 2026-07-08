import { LinearGradient } from "expo-linear-gradient";
import { Pressable, Text, View } from "react-native";

import { useTheme, type ThemeChoice } from "@/contexts/theme-context";
import { useHaptics } from "@/lib/haptics";
import {
  ACUITY_ACCENT_PRESETS,
  type AcuityAccent,
} from "@/lib/theme/tokens";

/**
 * Appearance card (Slice Q2, 2026-05-19). First user-visible surface
 * of the visual refresh — exposes Mode + Palette so we can validate
 * the theming system end-to-end before any other screen ships.
 *
 * Design ref: _design/design_handoff_acuity_v2/README.md § 09 · Profile
 * → "Appearance card (NEW — must build)".
 *
 * Composition:
 *   - "APPEARANCE" eyebrow label (mono, uppercase, 700, tracking 1.4)
 *   - Mode row: label + segmented control (System / Light / Dark)
 *   - Palette row: label + 4 swatch chips
 *
 * The two pickers share the same card surface to read as a single
 * "look & feel" group — separate cards would imply Mode and Palette
 * are independent settings, but they jointly define a token set.
 *
 * Token consumption: pulls `tokens` from useTheme() and applies via
 * inline styles for theme-tied surfaces. NativeWind className stays
 * for layout/typography. Pattern locked in for the rest of the
 * visual refresh.
 */

const PALETTE_OPTIONS: AcuityAccent[] = [
  "coral",
  "sunset",
  "citrus",
  "cobalt",
  "rose",
  "amber",
  "jade",
  "sky",
];

// Swatch gradient stops per design spec (slightly brighter than the
// production accent values — these read clearer at 36×36).
const SWATCH_GRADIENTS: Record<AcuityAccent, [string, string]> = {
  // Pre-computed from oklch in the design spec. Saved as hex to avoid
  // a culori conversion per swatch render — the swatches are static
  // previews and don't need the runtime token machinery.
  coral: ["#ffa074", "#9080ed"],
  sunset: ["#ff8a76", "#c875c8"],
  citrus: ["#f7c264", "#5fc0c8"],
  cobalt: ["#6e8df0", "#cad88b"],
  rose: ["#f08698", "#9750a7"],
  amber: ["#fca443", "#5965cd"],
  jade: ["#3fbe90", "#ef816b"],
  sky: ["#3fb1ea", "#ed8da4"],
};

export function AppearanceCard() {
  const { tokens, preference, setPreference, palette, setPalette } =
    useTheme();
  const { light } = useHaptics();

  const handlePickMode = (next: ThemeChoice) => {
    if (next === preference) return;
    light();
    setPreference(next);
  };

  const handlePickPalette = (next: AcuityAccent) => {
    if (next === palette) return;
    light();
    setPalette(next);
  };

  return (
    <View
      style={{
        borderRadius: tokens.radius.lg,
        backgroundColor: tokens.cardBg,
        borderWidth: 1,
        borderColor: tokens.cardBorder,
        padding: 16,
        gap: 16,
      }}
    >
      <Text
        style={{
          fontFamily: tokens.fontMono,
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 1.4,
          color: tokens.textTer,
        }}
      >
        APPEARANCE
      </Text>

      {/* Mode row */}
      <View style={{ gap: 8 }}>
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 13,
            fontWeight: "600",
            color: tokens.textSec,
          }}
        >
          Mode
        </Text>
        <ModeSegmented
          value={preference}
          onPick={handlePickMode}
          tokens={tokens}
        />
      </View>

      {/* Palette row */}
      <View style={{ gap: 8 }}>
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 13,
            fontWeight: "600",
            color: tokens.textSec,
          }}
        >
          Palette
        </Text>
        <View style={{ flexDirection: "row", gap: 12 }}>
          {PALETTE_OPTIONS.map((opt) => (
            <PaletteSwatch
              key={opt}
              accent={opt}
              selected={opt === palette}
              onPress={() => handlePickPalette(opt)}
              ringColor={tokens.text}
              labelColor={tokens.textTer}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── Mode segmented control ──────────────────────────────────────

interface SegmentedProps {
  value: ThemeChoice;
  onPick: (v: ThemeChoice) => void;
  tokens: ReturnType<typeof useTheme>["tokens"];
}

const MODE_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function ModeSegmented({ value, onPick, tokens }: SegmentedProps) {
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: tokens.bgInset,
        borderRadius: tokens.radius.pill,
        padding: 3,
      }}
    >
      {MODE_OPTIONS.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onPick(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: tokens.radius.pill,
              paddingVertical: 8,
              backgroundColor: selected ? tokens.cardBgRaised : "transparent",
            }}
          >
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 13,
                fontWeight: "600",
                color: selected ? tokens.text : tokens.textTer,
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Palette swatch chip ─────────────────────────────────────────

interface SwatchProps {
  accent: AcuityAccent;
  selected: boolean;
  onPress: () => void;
  ringColor: string;
  labelColor: string;
}

function PaletteSwatch({
  accent,
  selected,
  onPress,
  ringColor,
  labelColor,
}: SwatchProps) {
  const [gradStart, gradEnd] = SWATCH_GRADIENTS[accent];
  const presetName = ACUITY_ACCENT_PRESETS[accent].name.split(" ")[0];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${presetName} palette`}
      accessibilityState={{ selected }}
      style={{ alignItems: "center", gap: 6 }}
    >
      {/* The 36×36 swatch. Outer 2px ring when selected (gap from chip
          edge with `padding`, then inner pill renders the gradient). */}
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          padding: 2,
          borderWidth: selected ? 2 : 0,
          borderColor: selected ? ringColor : "transparent",
        }}
      >
        <LinearGradient
          colors={[gradStart, gradEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, borderRadius: 999 }}
        />
      </View>
      <Text
        style={{
          fontFamily: "System",
          fontSize: 10,
          fontWeight: "500",
          color: labelColor,
          letterSpacing: 0.2,
        }}
      >
        {presetName}
      </Text>
    </Pressable>
  );
}
