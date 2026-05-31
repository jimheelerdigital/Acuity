/**
 * Achievement celebration modal — RN port of celebration-card.html.
 *
 * Animation parity with the web reference:
 *   - Backdrop: 300ms fade in
 *   - Card: rises 20px + fades over 550ms with cubic-bezier(.16,.9,.3,1)
 *   - Badge: 240×240, 16s linear rotation loop
 *   - Halo: radial pulse 3s ease-in-out loop (opacity .35..0.6 + scale 1..1.06)
 *   - Kicker / title / description / Continue pill — same typography
 *
 * Confetti is INTENTIONALLY DEFERRED for v1.3 ship. The web canvas
 * confetti pattern doesn't translate to RN without a Skia / Lottie
 * dependency we haven't installed yet. A flat coral-glow halo is a
 * reasonable substitute for the moment; confetti is a polish-pass
 * follow-up tracked in PROGRESS.md.
 */

import { Ionicons } from "@expo/vector-icons";
import { Manrope_700Bold, Manrope_800ExtraBold } from "@expo-google-fonts/manrope";
import { GeistMono_500Medium } from "@expo-google-fonts/geist-mono";
import { LinearGradient } from "expo-linear-gradient";
import { useFonts } from "expo-font";
import { useEffect } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { BadgeSvg } from "./BadgeSvg";
import { ConfettiBurst } from "./ConfettiBurst";

const COLORS = {
  navyDeep: "#0F0F1A",
  text: "#F4F1EA",
  textSec: "#A7AEC4",
  coral: "#E89653",
  coralLight: "#F3B26B",
  coralDark: "#E07A3C",
};

const BADGE_SIZE = 240;

export function CelebrationModal({
  visible,
  slug,
  title,
  description,
  onContinue,
}: {
  visible: boolean;
  slug: string;
  title: string;
  description: string;
  onContinue: () => void;
}) {
  const [_fontsLoaded] = useFonts({
    Manrope_700Bold,
    Manrope_800ExtraBold,
    GeistMono_500Medium,
  });

  // Shared values for badge rotation + halo pulse + card rise.
  const rotation = useSharedValue(0);
  const haloOpacity = useSharedValue(0.35);
  const haloScale = useSharedValue(1);
  const cardOpacity = useSharedValue(0);
  const cardTranslate = useSharedValue(20);

  useEffect(() => {
    if (!visible) return;
    // Card rise: 550ms cubic-bezier(.16,.9,.3,1)
    cardOpacity.value = 0;
    cardTranslate.value = 20;
    cardOpacity.value = withTiming(1, {
      duration: 550,
      easing: Easing.bezier(0.16, 0.9, 0.3, 1),
    });
    cardTranslate.value = withTiming(0, {
      duration: 550,
      easing: Easing.bezier(0.16, 0.9, 0.3, 1),
    });
    // Badge rotation: 16s linear loop.
    rotation.value = 0;
    rotation.value = withRepeat(
      withTiming(360, { duration: 16000, easing: Easing.linear }),
      -1,
      false
    );
    // Halo pulse: 3s ease-in-out, both opacity + scale.
    haloOpacity.value = withRepeat(
      withTiming(0.6, {
        duration: 1500,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
    haloScale.value = withRepeat(
      withTiming(1.06, {
        duration: 1500,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
    return () => {
      cancelAnimation(rotation);
      cancelAnimation(haloOpacity);
      cancelAnimation(haloScale);
      cancelAnimation(cardOpacity);
      cancelAnimation(cardTranslate);
    };
  }, [visible, rotation, haloOpacity, haloScale, cardOpacity, cardTranslate]);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: haloOpacity.value,
    transform: [{ scale: haloScale.value }],
  }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslate.value }],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onContinue}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        {/* Skia-rendered confetti — fresh 120-particle burst each time
            the modal opens. Sits behind the card via absoluteFill +
            pointerEvents none so it doesn't intercept the Continue
            tap. The burst remounts when `visible` toggles, so closing
            and re-opening the modal replays from frame 0. */}
        <ConfettiBurst key={slug} visible={visible} />
        <Animated.View style={[styles.card, cardStyle]}>
          <View style={styles.orb}>
            <Animated.View style={[styles.halo, haloStyle]} />
            <Animated.View style={[styles.spin, badgeStyle]}>
              <BadgeSvg slug={slug} state="earned" size={BADGE_SIZE} />
            </Animated.View>
          </View>
          <Text style={styles.kicker}>Achievement unlocked</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          <Pressable
            onPress={onContinue}
            accessibilityRole="button"
            accessibilityLabel="Continue"
            style={({ pressed }) => [
              styles.continueWrap,
              pressed && { transform: [{ scale: 0.97 }] },
            ]}
          >
            <LinearGradient
              colors={[COLORS.coralLight, COLORS.coralDark] as const}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.continueGradient}
            >
              <Text style={styles.continueText}>Continue</Text>
              <Ionicons name="arrow-forward" size={16} color="#2A1206" />
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8,8,16,0.86)",
    paddingHorizontal: 32,
  },
  card: {
    alignItems: "center",
  },
  orb: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  halo: {
    position: "absolute",
    width: BADGE_SIZE + 40,
    height: BADGE_SIZE + 40,
    borderRadius: (BADGE_SIZE + 40) / 2,
    backgroundColor: "rgba(244,161,78,0.30)",
    // RN doesn't support CSS filter:blur — approximate with the
    // gradient-via-opacity-falloff trick. The visual is softer than
    // the web 34px blur but reads as a coral glow at runtime.
    shadowColor: "#F4A14E",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 34,
    elevation: Platform.OS === "android" ? 12 : 0,
  },
  spin: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  kicker: {
    fontFamily: "GeistMono_500Medium",
    fontSize: 11,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    color: COLORS.coral,
    marginTop: 18,
    marginBottom: 10,
  },
  title: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 34,
    letterSpacing: -0.8,
    color: COLORS.text,
    marginBottom: 10,
    textAlign: "center",
  },
  description: {
    fontFamily: "Manrope_700Bold",
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.textSec,
    maxWidth: 340,
    textAlign: "center",
    marginBottom: 30,
    fontWeight: "400",
  },
  continueWrap: {
    borderRadius: 999,
    overflow: "hidden",
  },
  continueGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  continueText: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 16,
    letterSpacing: -0.2,
    color: "#2A1206",
  },
});
