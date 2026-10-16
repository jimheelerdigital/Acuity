import { useRef, type ReactNode } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Card, MoodFace, PrimaryButton, TextButton, V11 } from "./ui";

/**
 * "Does this sound like you?" — Keenan's design: an eyebrow, a bold
 * question, a white card with a mood face and the statement in italics,
 * "Yes, that's me" (gradient, check) and a quiet "Not really". The card
 * flies off to the side of the answer (web `fly-yes` / `fly-no`).
 */
export function StatementScreenBody({
  top,
  eyebrow,
  title,
  statement,
  mood,
  onAnswer,
  footnote,
}: {
  top?: ReactNode;
  eyebrow?: string;
  title: string;
  statement: string;
  mood: "overloaded" | "worried" | "hopeful";
  onAnswer: (v: "yes" | "no") => void;
  footnote?: ReactNode;
}) {
  const x = useSharedValue(0);
  const answered = useRef(false);

  const fly = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value * 420 }, { rotate: `${x.value * 10}deg` }],
    opacity: 1 - Math.abs(x.value),
  }));

  const answer = (v: "yes" | "no") => {
    if (answered.current) return;
    answered.current = true;
    x.value = withTiming(v === "yes" ? 1 : -1, { duration: 380, easing: Easing.in(Easing.quad) });
    setTimeout(() => {
      onAnswer(v);
      // Coming back to this screen (back button) must be answerable again.
      setTimeout(() => {
        answered.current = false;
        x.value = 0;
      }, 400);
    }, 380);
  };

  return (
    <View style={{ flex: 1, justifyContent: "center" }}>
      {top}
      {eyebrow ? (
        <Animated.Text
          entering={FadeInDown.duration(360)}
          style={{ textAlign: "center", fontFamily: V11.display, fontSize: 14, color: V11.coral, marginBottom: 10 }}
        >
          {eyebrow}
        </Animated.Text>
      ) : null}
      <Animated.Text
        entering={FadeInDown.duration(380)}
        accessibilityRole="header"
        style={{ textAlign: "center", fontFamily: V11.heading, fontSize: 27, lineHeight: 32, letterSpacing: -0.6, color: V11.ink, marginBottom: 20 }}
      >
        {title}
      </Animated.Text>
      <Animated.View entering={FadeInDown.delay(80).duration(450)}>
        <Animated.View style={fly}>
          <Card style={{ alignItems: "center", paddingHorizontal: 24, paddingTop: 26, paddingBottom: 30, borderRadius: 28 }}>
            <MoodFace mood={mood} size={64} />
            <Text
              style={{
                marginTop: 18,
                textAlign: "center",
                fontSize: 21,
                lineHeight: 29,
                fontStyle: "italic",
                fontWeight: "500",
                letterSpacing: -0.3,
                color: V11.ink,
              }}
            >
              “{statement}”
            </Text>
          </Card>
        </Animated.View>
      </Animated.View>
      <View style={{ marginTop: 22, gap: 4 }}>
        <PrimaryButton label="Yes, that's me" icon="check" onPress={() => answer("yes")} />
        <TextButton label="Not really" onPress={() => answer("no")} />
      </View>
      {footnote}
    </View>
  );
}
