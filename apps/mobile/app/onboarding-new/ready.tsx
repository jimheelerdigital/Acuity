import { useEffect, useRef, useState } from "react";
import { Dimensions, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { READY } from "@/lib/onboarding-v11/copy";
import { goBack, goNext, trackV11 } from "@/lib/onboarding-v11/flow";

import { ConfettiBurst } from "./_v11/confetti";
import { Body, Card, FunnelHeader, LightScreen, MoodFace, PROGRESS, PrimaryButton, V11 } from "./_v11/ui";

/** Miro #8 — "Are you ready to add the system…?" Yes → confetti explodes. */
export default function V11Ready() {
  const [burst, setBurst] = useState(0);
  const going = useRef(false);

  useEffect(() => {
    trackV11("ready", "viewed");
  }, []);

  const onYes = () => {
    if (going.current) return;
    going.current = true;
    trackV11("ready", "answered", "yes");
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setBurst((n) => n + 1);
    setTimeout(() => {
      goNext("ready");
      setTimeout(() => (going.current = false), 500);
    }, 1500);
  };

  const { width, height } = Dimensions.get("window");

  return (
    <LightScreen>
      <FunnelHeader progress={PROGRESS.ready} onBack={goBack} />
      <Body center footer={<PrimaryButton label={READY.yes} icon="check" onPress={onYes} />}>
        <Animated.View entering={FadeInDown.duration(420)} style={{ alignItems: "center" }}>
          <Card style={{ width: 112, height: 112, borderRadius: 56, alignItems: "center", justifyContent: "center", marginBottom: 26 }}>
            <MoodFace mood={READY.mood} size={76} />
          </Card>
          <Text
            accessibilityRole="header"
            style={{ textAlign: "center", fontFamily: V11.heading, fontSize: 29, lineHeight: 35, letterSpacing: -0.7, color: V11.ink }}
          >
            {READY.title}
          </Text>
          <Text style={{ marginTop: 14, textAlign: "center", fontSize: 17, lineHeight: 25, color: V11.sec, maxWidth: 320 }}>
            {READY.sub}
          </Text>
        </Animated.View>
        <View style={{ height: 40 }} />
      </Body>
      {burst > 0 ? <ConfettiBurst key={burst} origin={{ x: width / 2, y: height - 90 }} /> : null}
    </LightScreen>
  );
}
