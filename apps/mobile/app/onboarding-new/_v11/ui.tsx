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
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardSafeView } from "@/components/keyboard/keyboard-safe-view";
import Svg, { Circle, Defs, Ellipse, LinearGradient as SvgLinearGradient, Path, Stop } from "react-native-svg";
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
  hook: 0.06,
  age: 0.12,
  carrying: 0.19,
  sound: 0.26,
  notlazy: 0.33,
  name: 0.39,
  year: 0.45,
  ready: 0.51,
  consent: 0.57,
  record: 0.64,
  processing: 0.74,
  reveal: 0.84,
  account: 0.92,
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
    // KeyboardSafeView (1.9.5): the pinned CTA footer rides above the
    // keyboard. Before, only the scroll content was inset
    // (automaticallyAdjustKeyboardInsets) and the footer — the Continue
    // button on Name/Consent — sat under the keyboard. The scroll view
    // shrinks with the padding, so it needs no keyboard insets of its own.
    <KeyboardSafeView extraSpace={0}>
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
        showsVerticalScrollIndicator={false}
        // No rubber-band into blank space past the content (Keenan, build
        // 172: "lets you scroll down way too far").
        bounces={false}
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
    </KeyboardSafeView>
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

// ── Mood faces ───────────────────────────────────────────────────────────
// Cleaner redraw (Keenan, 2026-10-15: "make the faces look a bit cleaner"):
// a soft gradient disc, solid rounded eyes, one bold mouth stroke, and no
// scribbles / sweat drops. Same three moods, same colour families as the
// web funnel's MoodAvatar so ad → web → app still match.
type Mood = "overloaded" | "worried" | "hopeful";
const MOOD_COLORS: Record<Mood, { top: string; bottom: string; ink: string; cheek: string }> = {
  overloaded: { top: "#FFE6DF", bottom: "#FFC9BC", ink: "#5C2E26", cheek: "#F7A897" },
  worried: { top: "#FFF0D6", bottom: "#FBD9A6", ink: "#523709", cheek: "#F2BE7A" },
  hopeful: { top: "#E3F8E7", bottom: "#BDEBC6", ink: "#1E4729", cheek: "#93D6A2" },
};

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Animated (Keenan, build 172: "an animated face of someone flustered").
 * Every face blinks every few seconds. The overloaded face is FLUSTERED: a
 * nervous little head-shake, cheeks flushing, eyes darting. Worried tilts
 * side to side; hopeful bobs gently. Respects Reduce Motion via reanimated's
 * system setting.
 */
export function MoodFace({ mood, size = 64 }: { mood: Mood; size?: number }) {
  const c = MOOD_COLORS[mood];
  const id = `mf-${mood}`;
  const line = { stroke: c.ink, strokeWidth: 3.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };

  const blink = useSharedValue(1);
  const sway = useSharedValue(0);
  const flush = useSharedValue(0.45);
  const dart = useSharedValue(0);

  useEffect(() => {
    blink.value = withRepeat(
      withSequence(withDelay(2600, withTiming(0.1, { duration: 80 })), withTiming(1, { duration: 110 })),
      -1,
      false
    );
    if (mood === "overloaded") {
      sway.value = withRepeat(
        withSequence(
          withTiming(-7, { duration: 70 }),
          withTiming(7, { duration: 90 }),
          withTiming(-5, { duration: 80 }),
          withTiming(4, { duration: 80 }),
          withTiming(0, { duration: 70 }),
          withDelay(1500, withTiming(0, { duration: 1 }))
        ),
        -1,
        false
      );
      flush.value = withRepeat(withSequence(withTiming(0.85, { duration: 700 }), withTiming(0.45, { duration: 900 })), -1, false);
      dart.value = withRepeat(
        withSequence(withDelay(900, withTiming(-1.6, { duration: 120 })), withDelay(500, withTiming(1.6, { duration: 120 })), withDelay(500, withTiming(0, { duration: 120 }))),
        -1,
        false
      );
    } else if (mood === "worried") {
      sway.value = withRepeat(withSequence(withTiming(-4, { duration: 1100 }), withTiming(4, { duration: 1100 })), -1, true);
    } else {
      sway.value = withRepeat(withSequence(withTiming(-3, { duration: 900 }), withTiming(0, { duration: 900 })), -1, true);
    }
  }, [mood, blink, sway, flush, dart]);

  const wrap = useAnimatedStyle(() =>
    mood === "hopeful"
      ? { transform: [{ translateY: sway.value }] }
      : { transform: [{ rotate: `${sway.value}deg` }] }
  );
  const eyeL = useAnimatedProps(() => ({ ry: 3.2 * blink.value, cx: 24 + dart.value }));
  const eyeR = useAnimatedProps(() => ({ ry: 3.2 * blink.value, cx: 40 + dart.value }));
  const cheek = useAnimatedProps(() => ({ opacity: flush.value }));

  return (
    <Animated.View style={[{ width: size, height: size }, wrap]}>
      <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel={mood}>
        <Defs>
          <SvgLinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c.top} />
            <Stop offset="1" stopColor={c.bottom} />
          </SvgLinearGradient>
        </Defs>
        <Circle cx={32} cy={32} r={32} fill={`url(#${id})`} />
        <AnimatedCircle cx={17} cy={39} r={4.5} fill={c.cheek} animatedProps={cheek} />
        <AnimatedCircle cx={47} cy={39} r={4.5} fill={c.cheek} animatedProps={cheek} />
        {mood === "hopeful" ? (
          <>
            <Path d="M20 30 q4 -5 8 0" {...line} />
            <Path d="M36 30 q4 -5 8 0" {...line} />
            <Path d="M23 41 q9 9 18 0" {...line} />
          </>
        ) : null}
        {mood === "worried" ? (
          <>
            <Path d="M19.5 23.5 l7 -2" {...line} strokeWidth={2.8} />
            <Path d="M44.5 23.5 l-7 -2" {...line} strokeWidth={2.8} />
            <AnimatedEllipse cx={24} cy={30} rx={3.2} ry={3.2} fill={c.ink} animatedProps={eyeL} />
            <AnimatedEllipse cx={40} cy={30} rx={3.2} ry={3.2} fill={c.ink} animatedProps={eyeR} />
            <Path d="M25 45 q7 -5 14 0" {...line} />
          </>
        ) : null}
        {mood === "overloaded" ? (
          <>
            <Path d="M19 23 l7 1.5" {...line} strokeWidth={2.6} />
            <Path d="M45 23 l-7 1.5" {...line} strokeWidth={2.6} />
            <AnimatedEllipse cx={24} cy={30} rx={3.2} ry={3.2} fill={c.ink} animatedProps={eyeL} />
            <AnimatedEllipse cx={40} cy={30} rx={3.2} ry={3.2} fill={c.ink} animatedProps={eyeR} />
            <Path d="M24 44 q2.7 -2.6 5.4 0 t5.4 0 t5.4 0" {...line} strokeWidth={2.8} />
          </>
        ) : null}
      </Svg>
    </Animated.View>
  );
}
