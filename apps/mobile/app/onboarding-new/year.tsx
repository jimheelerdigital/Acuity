import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useAuth } from "@/contexts/auth-context";
import { YEAR } from "@/lib/onboarding-v11/copy";
import { loadAnswers } from "@/lib/onboarding-v11/answers";
import { goBack, goNext, trackV11 } from "@/lib/onboarding-v11/flow";

import { Body, Card, FunnelHeader, Heading, IconTile, LightScreen, PROGRESS, PrimaryButton, V11 } from "./_v11/ui";

/** Miro #7 — "{name}'s year with Ripple" (Keenan's screenshot). */
export default function V11Year() {
  const { user } = useAuth();
  const [name, setName] = useState<string | null>(user?.name?.trim().split(/\s+/)[0] || null);

  useEffect(() => {
    trackV11("year", "viewed");
    void loadAnswers().then((a) => {
      if (a.firstName) setName(a.firstName);
    });
  }, []);

  return (
    <LightScreen>
      <FunnelHeader progress={PROGRESS.year} onBack={goBack} />
      <Body
        footer={
          <PrimaryButton
            label={YEAR.cta}
            onPress={() => {
              trackV11("year", "answered", "continue");
              goNext("year");
            }}
          />
        }
      >
        <Heading eyebrow={YEAR.eyebrow} title={name ? `${name}'s year with Ripple` : "Your year with Ripple"} />
        <View>
          {/* The thin line the tiles hang on. */}
          <View style={{ position: "absolute", left: 27, top: 20, bottom: 20, width: 2, backgroundColor: V11.line }} />
          {YEAR.rows.map((r, i) => (
            <Animated.View
              key={r.day}
              entering={FadeInDown.delay(150 + i * 180).duration(420)}
              style={{ flexDirection: "row", gap: 14, marginBottom: 14 }}
            >
              <View style={{ shadowColor: V11.coral, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12, shadowOpacity: 0.3 }}>
                <IconTile name={r.icon} on size={56} radius={18} />
              </View>
              <Card style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 20 }}>
                <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.8, color: V11.coral }}>{r.day.toUpperCase()}</Text>
                <Text style={{ marginTop: 2, fontFamily: V11.display, fontSize: 17, lineHeight: 22, color: V11.ink }}>{r.title}</Text>
                <Text style={{ marginTop: 4, fontSize: 14, lineHeight: 20, color: V11.sec }}>{r.text}</Text>
              </Card>
            </Animated.View>
          ))}
        </View>
      </Body>
    </LightScreen>
  );
}
