/**
 * Achievement celebration modal — RN port of celebration-card.html.
 *
 * Animation parity with the web reference:
 *   - Backdrop: 300ms fade in
 *   - Card: rises 20px + fades over 550ms with cubic-bezier(.16,.9,.3,1)
 *   - Badge: 240×240, 16s linear rotation loop
 *   - Kicker / title / description / Continue pill — same typography
 *
 * v1.3 (2026-06-03): Halo glow removed. Badge sits directly on the
 * dark navy backdrop with the Skia confetti burst behind it.
 */

import { Ionicons } from "@expo/vector-icons";
import { Manrope_700Bold, Manrope_800ExtraBold } from "@expo-google-fonts/manrope";
import { GeistMono_500Medium } from "@expo-google-fonts/geist-mono";
import { LinearGradient } from "expo-linear-gradient";
import { useFonts } from "expo-font";
import { useEffect } from "react";
import {
  Modal,
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

  // Shared values for badge rotation + card rise.
  const rotation = useSharedValue(0);
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
    return () => {
      cancelAnimation(rotation);
      cancelAnimation(cardOpacity);
      cancelAnimation(cardTranslate);
    };
  }, [visible, rotation, cardOpacity, cardTranslate]);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
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
          <Animated.View style={[styles.spin, badgeStyle]}>
            <BadgeSvg slug={slug} state="earned" size={BADGE_SIZE} />
          </Animated.View>
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
  spin: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
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
