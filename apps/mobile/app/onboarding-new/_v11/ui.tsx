import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { useEffect } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, G, Path } from "react-native-svg";
import {
  ArrowRight,
  Bell,
  Briefcase,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Dumbbell,
  Eye,
  Heart,
  ListTodo,
  Rocket,
  Smartphone,
  Sprout,
  Star,
  Target,
  User,
  Users,
  Wallet,
  Waves,
} from "lucide-react-native";

/**
 * Onboarding v11 visual kit — Keenan's screen designs (Miro, 2026-10).
 *
 * The look is the web funnel's (apps/web/src/components/funnel-v9.tsx), on
 * purpose: one brand from ad → web → app.
 *   - a warm light page (peach top-left fading to cool white)
 *   - bold black centred headlines
 *   - white rounded cards with a hairline border and soft shadow
 *   - coral gradient icon tiles (soft coral tile when unselected)
 *   - a full-width coral gradient pill with an arrow
 *   - a round back button and a thin continuous progress bar (Miro: "a
 *     progress bar … NOT STEPS")
 *
 * Always light, whatever the user's appearance setting: this is the
 * marketing surface Keenan designed, and his designs are light.
 *
 * ⚠️ Every Pressable style here is an OBJECT. RN 0.81 + NativeWind in this
 * app silently drops function-form styles (see _v10/_ui.tsx).
 */

// ── Palette (fixed light; sampled from Keenan's designs + web tokens) ────
export const V11 = {
  ink: "#121216",
  sec: "#5B5B66",
  ter: "#8C8C97",
  quiet: "#B4B4BD",
  line: "rgba(18,18,22,0.08)",
  lineStrong: "rgba(18,18,22,0.12)",
  card: "#FFFFFF",
  coral: "#F08A64",
  coralDeep: "#D9704E",
  coralSoft: "#FFEFE8",
  tint: "#FFF5F2",
  ring: "rgba(240,138,100,0.30)",
  star: "#F5B83D",
  good: "#2FB574",
  /** Coral gradient — light peach to deep coral, left→right (the buttons). */
  grad: ["#FFAA84", "#F59570", "#DC7553"] as const,
  /** Page background — peach glow top-left into cool white. */
  page: ["#FEEDE4", "#F8F4F6", "#F3F3F8"] as const,
  heading: "Manrope_800ExtraBold",
  display: "Manrope_700Bold",
};

const shadowCard: ViewStyle = {
  shadowColor: "#141028",
  shadowOffset: { width: 0, height: 6 },
  shadowRadius: 16,
  shadowOpacity: 0.06,
  elevation: 2,
};

export function tap() {
  void Haptics.selectionAsync().catch(() => {});
}

// ── Progress (one continuous bar across the whole funnel) ────────────────
/**
 * Fraction of the funnel done when each screen shows. Fixed positions in
 * the route order — never a timer. Keep in step with the route order in
 * lib/onboarding-v11/flow.ts.
 */
export const PROGRESS: Record<string, number> = {
  account: 0.04,
  name: 0.08,
  hook: 0.12,
  age: 0.18,
  carrying: 0.25,
  sound: 0.32,
  notlazy: 0.39,
  year: 0.46,
  ready: 0.52,
  consent: 0.58,
  record: 0.66,
  processing: 0.78,
  reveal: 0.9,
};

// ── Page ─────────────────────────────────────────────────────────────────
export function LightScreen({ children }: { children: ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: V11.page[2] }}>
      <StatusBar style="dark" />
      <LinearGradient
        colors={[...V11.page]}
        locations={[0, 0.38, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.75, y: 0.7 }}
        style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}
      />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        {children}
      </SafeAreaView>
    </View>
  );
}

export function FunnelHeader({
  progress,
  onBack,
}: {
  progress: number;
  /** Omit to hide the back button (e.g. after the debrief is sent). */
  onBack?: () => void;
}) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withTiming(Math.max(0.02, Math.min(1, progress)), {
      duration: 520,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingTop: 8, height: 52 }}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "rgba(255,255,255,0.75)",
            borderWidth: 1,
            borderColor: V11.lineStrong,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ChevronLeft size={20} color={V11.ink} strokeWidth={2.2} />
        </Pressable>
      ) : (
        <View style={{ width: 40 }} />
      )}
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
        style={{ flex: 1, height: 7, borderRadius: 4, backgroundColor: "rgba(18,18,22,0.06)", overflow: "hidden" }}
      >
        <Animated.View style={[{ height: "100%", borderRadius: 4, overflow: "hidden" }, fill]}>
          <LinearGradient colors={[...V11.grad]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </View>
      <View style={{ width: 4 }} />
    </View>
  );
}

/** Scrollable body + a pinned bottom bar for the CTA. */
export function Body({
  children,
  footer,
  center = false,
}: {
  children: ReactNode;
  footer?: ReactNode;
  /** Vertically centre short content (statement screens). */
  center?: boolean;
}) {
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 20,
          paddingTop: 18,
          paddingBottom: 28,
          justifyContent: center ? "center" : "flex-start",
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer ? (
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 10,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: V11.lineStrong,
            backgroundColor: "rgba(246,245,249,0.92)",
            gap: 6,
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

// ── Type ─────────────────────────────────────────────────────────────────
export function Heading({ eyebrow, title, sub, align = "center", size = 28 }: {
  eyebrow?: string;
  title: string;
  sub?: string;
  align?: "center" | "left";
  size?: number;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(380)} style={{ marginBottom: 24 }}>
      {eyebrow ? (
        <Text style={{ textAlign: align, fontFamily: V11.display, fontSize: 14, color: V11.coral, marginBottom: 8, letterSpacing: 0.2 }}>
          {eyebrow}
        </Text>
      ) : null}
      <Text
        accessibilityRole="header"
        style={{ textAlign: align, fontFamily: V11.heading, fontSize: size, lineHeight: size * 1.18, letterSpacing: -0.6, color: V11.ink }}
      >
        {title}
      </Text>
      {sub ? (
        <Text style={{ textAlign: align, marginTop: 10, fontSize: 16, lineHeight: 23, color: V11.sec }}>{sub}</Text>
      ) : null}
    </Animated.View>
  );
}

export const textBody: TextStyle = { fontSize: 16, lineHeight: 24, color: V11.sec };

// ── Buttons ──────────────────────────────────────────────────────────────
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  busy = false,
  icon = "arrow",
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  icon?: "arrow" | "check" | "none";
  accessibilityLabel?: string;
}) {
  const inactive = disabled || busy;
  return (
    <Pressable
      onPress={() => {
        if (inactive) return;
        tap();
        onPress();
      }}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy }}
      style={{
        borderRadius: 999,
        opacity: disabled ? 0.45 : 1,
        shadowColor: V11.coral,
        shadowOffset: { width: 0, height: 10 },
        shadowRadius: disabled ? 0 : 18,
        shadowOpacity: disabled ? 0 : 0.35,
        elevation: disabled ? 0 : 6,
      }}
    >
      <LinearGradient
        colors={[...V11.grad]}
        start={{ x: 0, y: 0.3 }}
        end={{ x: 1, y: 0.7 }}
        style={{ borderRadius: 999, paddingVertical: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}
      >
        {busy ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <>
            {icon === "check" ? <Check size={20} color="#ffffff" strokeWidth={3} /> : null}
            <Text style={{ fontFamily: V11.display, fontSize: 18, color: "#ffffff" }}>{label}</Text>
            {icon === "arrow" ? <ArrowRight size={18} color="#ffffff" strokeWidth={2.4} /> : null}
          </>
        )}
      </LinearGradient>
    </Pressable>
  );
}

export function TextButton({ label, onPress, color = V11.sec }: { label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={6} style={{ paddingVertical: 12, alignItems: "center" }}>
      <Text style={{ fontFamily: V11.display, fontSize: 16, color }}>{label}</Text>
    </Pressable>
  );
}

// ── Surfaces ─────────────────────────────────────────────────────────────
export function Card({ children, style, selected = false }: { children: ReactNode; style?: ViewStyle; selected?: boolean }) {
  return (
    <View
      style={[
        {
          backgroundColor: selected ? V11.tint : V11.card,
          borderRadius: 24,
          borderWidth: selected ? 1.5 : 1,
          borderColor: selected ? V11.coral : V11.lineStrong,
          ...shadowCard,
        },
        selected ? { shadowColor: V11.coral, shadowOpacity: 0.22, shadowRadius: 0, shadowOffset: { width: 0, height: 0 } } : null,
        style,
      ]}
    >
      {selected ? (
        // The 3px coral ring from the web `card-sel`.
        <View
          style={{ position: "absolute", top: -4, left: -4, right: -4, bottom: -4, borderRadius: 28, borderWidth: 3, borderColor: V11.ring, pointerEvents: "none" }}
        />
      ) : null}
      {children}
    </View>
  );
}

export type IconName =
  | "user" | "briefcase" | "users" | "rocket" | "wallet" | "dumbbell" | "heart"
  | "list" | "target" | "eye" | "waves" | "sprout" | "bell";

const ICONS = {
  user: User, briefcase: Briefcase, users: Users, rocket: Rocket, wallet: Wallet, dumbbell: Dumbbell,
  heart: Heart, list: ListTodo, target: Target, eye: Eye, waves: Waves, sprout: Sprout, bell: Bell,
} as const;

/** Rounded square icon tile: soft coral when idle, coral gradient when on. */
export function IconTile({ name, on, size = 48, radius = 14 }: { name: IconName; on: boolean; size?: number; radius?: number }) {
  const Icon = ICONS[name];
  const icon = <Icon size={Math.round(size * 0.46)} color={on ? "#ffffff" : V11.coral} strokeWidth={2} />;
  if (!on) {
    return (
      <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: V11.coralSoft, alignItems: "center", justifyContent: "center" }}>
        {icon}
      </View>
    );
  }
  return (
    <LinearGradient
      colors={[...V11.grad]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: radius, alignItems: "center", justifyContent: "center" }}
    >
      {icon}
    </LinearGradient>
  );
}

/** Single-select row (age): icon tile, label, chevron → check when picked. */
export function OptionRow({ icon, label, selected, onPress, index = 0 }: {
  icon: IconName;
  label: string;
  selected: boolean;
  onPress: () => void;
  index?: number;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(60 + index * 50).duration(360)}>
      <Pressable
        onPress={() => {
          tap();
          onPress();
        }}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={label}
      >
        <Card selected={selected} style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 18, paddingVertical: 16 }}>
          <IconTile name={icon} on={selected} />
          <Text style={{ flex: 1, fontSize: 18, fontWeight: "500", color: V11.ink }}>{label}</Text>
          {selected ? <CircleCheck size={24} color={V11.coral} strokeWidth={2} /> : <ChevronRight size={22} color={V11.quiet} />}
        </Card>
      </Pressable>
    </Animated.View>
  );
}

/** Multi-select grid tile (carrying): centred icon + label, check badge. */
export function OptionTile({ icon, label, selected, onPress, index = 0 }: {
  icon: IconName;
  label: string;
  selected: boolean;
  onPress: () => void;
  index?: number;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(60 + index * 45).duration(360)} style={{ width: "48.5%" }}>
      <Pressable
        onPress={() => {
          tap();
          onPress();
        }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={label}
      >
        <Card selected={selected} style={{ alignItems: "center", gap: 12, paddingHorizontal: 12, paddingTop: 20, paddingBottom: 18, minHeight: 148, justifyContent: "center" }}>
          {selected ? (
            <View style={{ position: "absolute", top: 10, right: 10 }}>
              <GradientDot size={24}>
                <Check size={14} color="#ffffff" strokeWidth={3} />
              </GradientDot>
            </View>
          ) : null}
          <IconTile name={icon} on={selected} size={54} radius={16} />
          <Text style={{ textAlign: "center", fontFamily: V11.display, fontSize: 16, lineHeight: 21, color: V11.ink }}>{label}</Text>
        </Card>
      </Pressable>
    </Animated.View>
  );
}

export function GradientDot({ size, children }: { size: number; children?: ReactNode }) {
  return (
    <LinearGradient
      colors={[...V11.grad]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center" }}
    >
      {children}
    </LinearGradient>
  );
}

export function Stars({ size = 16, label }: { size?: number; label?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 2 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} size={size} color={V11.star} fill={V11.star} />
        ))}
      </View>
      {label ? <Text style={{ fontSize: 13, fontWeight: "500", color: V11.ter }}>{label}</Text> : null}
    </View>
  );
}

function initials(name: string): string {
  if (name.toLowerCase().includes("app store")) return "";
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export function ReviewCard({ quote, name, style }: { quote: string; name: string; style?: ViewStyle }) {
  const ini = initials(name);
  return (
    <Card style={{ padding: 20, ...style }}>
      <View style={{ flexDirection: "row", gap: 2, marginBottom: 10 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} size={15} color={V11.star} fill={V11.star} />
        ))}
      </View>
      <Text style={{ fontSize: 16, lineHeight: 24, color: V11.ink }}>“{quote}”</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: V11.coralSoft, alignItems: "center", justifyContent: "center" }}>
          {ini ? (
            <Text style={{ fontSize: 11, fontWeight: "800", color: V11.coral }}>{ini}</Text>
          ) : (
            <Smartphone size={15} color={V11.coral} />
          )}
        </View>
        <Text style={{ fontSize: 14, fontWeight: "600", color: V11.sec }}>{name}</Text>
      </View>
    </Card>
  );
}

/** The Ripple mark, white on the coral square — the app icon look. */
export function RippleAppIcon({ size = 44 }: { size?: number }) {
  return (
    <LinearGradient
      colors={[...V11.grad]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: size * 0.27, alignItems: "center", justifyContent: "center" }}
    >
      <Image
        source={require("../../../assets/brand/ripple-mark-white.png")}
        resizeMode="contain"
        style={{ width: size * 0.58, height: size * 0.58 }}
        accessibilityIgnoresInvertColors
      />
    </LinearGradient>
  );
}

/** "ripple" lockup in brand coral (start screen). */
export function RippleLockupCoral({ height = 40 }: { height?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Image
        source={require("../../../assets/brand/ripple-mark-coral-t.png")}
        resizeMode="contain"
        style={{ width: height, height }}
        accessibilityIgnoresInvertColors
      />
      <Text style={{ fontFamily: V11.heading, fontSize: height * 0.72, letterSpacing: -0.8, color: V11.ink }}>ripple</Text>
    </View>
  );
}

export function Checkbox({ on }: { on: boolean }) {
  if (on) {
    return (
      <LinearGradient colors={[...V11.grad]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" }}>
        <Check size={17} color="#ffffff" strokeWidth={3} />
      </LinearGradient>
    );
  }
  return <View style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: V11.quiet, backgroundColor: "#ffffff" }} />;
}

// ── Mood faces (port of web components/mood-avatar.tsx, "hue" tone) ──────
// Only the moods this funnel uses. Colours are the web's oklch values
// resolved to hex.
type Mood = "overloaded" | "worried" | "hopeful";
const MOOD_COLORS: Record<Mood, { disc: string; ring: string; ink: string; cue: string }> = {
  overloaded: { disc: "#ffdbd2", ring: "#fcc1b6", ink: "#5c2e26", cue: "#cd6151" },
  worried: { disc: "#fee3c0", ring: "#eccb9e", ink: "#523709", cue: "#b67700" },
  hopeful: { disc: "#cff3d5", ring: "#b1dfb9", ink: "#1e4729", cue: "#399d57" },
};

export function MoodFace({ mood, size = 64 }: { mood: Mood; size?: number }) {
  const c = MOOD_COLORS[mood];
  const sw = 2.4;
  const stroke = { stroke: c.ink, strokeWidth: sw, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel={mood}>
      <Circle cx={32} cy={32} r={31} fill={c.disc} stroke={c.ring} strokeWidth={1.5} />
      <G transform="translate(32 41) scale(1.25) translate(-32 -41)">
        {mood === "overloaded" ? (
          <>
            <Circle cx={25} cy={36} r={3.2} {...stroke} />
            <Circle cx={39} cy={36} r={3.2} {...stroke} />
            <Path d="M25 47 q2.3 -2.4 4.6 0 t4.6 0 t4.6 0" {...stroke} />
          </>
        ) : null}
        {mood === "worried" ? (
          <>
            <Path d="M21 31 l7 -2.5" {...stroke} />
            <Path d="M43 31 l-7 -2.5" {...stroke} />
            <Circle cx={25} cy={36} r={2.4} fill={c.ink} />
            <Circle cx={39} cy={36} r={2.4} fill={c.ink} />
            <Path d="M27 49 q5 -4 10 0" {...stroke} />
          </>
        ) : null}
        {mood === "hopeful" ? (
          <>
            <Path d="M21.5 37 q3.5 -4 7 0" {...stroke} />
            <Path d="M35.5 37 q3.5 -4 7 0" {...stroke} />
            <Path d="M25 46 q7 6 14 0" {...stroke} />
          </>
        ) : null}
      </G>
      {mood === "overloaded" ? (
        <Path
          d="M22 16 c3 -7 9 3 12 -3 s6 6 9 0 m-19 3 c4 3 7 -4 11 0 s5 2 7 -2"
          stroke={c.cue}
          strokeWidth={sw}
          strokeLinecap="round"
          fill="none"
        />
      ) : null}
      {mood === "worried" ? (
        <Path d="M49 22 c-2.6 3.6 -3.4 5.6 -3.4 7 a3.4 3.4 0 0 0 6.8 0 c0 -1.4 -0.8 -3.4 -3.4 -7 z" fill={c.cue} />
      ) : null}
      {mood === "hopeful" ? <Path d="M46 8 q1 6 7 7 q-6 1 -7 7 q-1 -6 -7 -7 q6 -1 7 -7 z" fill={c.cue} /> : null}
    </Svg>
  );
}

