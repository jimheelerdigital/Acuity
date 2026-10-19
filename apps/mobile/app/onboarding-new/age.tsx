import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { AGE } from "@/lib/onboarding-v11/copy";
import { loadAnswers, saveAnswers } from "@/lib/onboarding-v11/answers";
import { goBack, goNext, trackV11 } from "@/lib/onboarding-v11/flow";

import { Body, FunnelHeader, Heading, LightScreen, OptionRow, PROGRESS } from "./_v11/ui";

/** Miro #3 — age range. One tap picks and moves on. */
export default function V11Age() {
  const [picked, setPicked] = useState<string | null>(null);
  // Guards a double tap from advancing twice. Not keyed off `picked`:
  // coming back pre-fills it and would leave every row dead (web 2026-09-25).
  const advancing = useRef(false);

  useEffect(() => {
    trackV11("age", "viewed");
    void loadAnswers().then((a) => setPicked(a.age ?? null));
  }, []);

  const choose = (id: string) => {
    if (advancing.current) return;
    advancing.current = true;
    setPicked(id);
    trackV11("age", "answered", id);
    void saveAnswers({ age: id });
    setTimeout(() => {
      goNext("age");
      setTimeout(() => (advancing.current = false), 400);
    }, 320);
  };

  return (
    <LightScreen>
      <FunnelHeader progress={PROGRESS.age} onBack={goBack} />
      <Body>
        <Heading title={AGE.title} />
        <View style={{ gap: 14 }}>
          {AGE.options.map((o, i) => (
            <OptionRow key={o.id} index={i} icon="user" label={o.label} selected={picked === o.id} onPress={() => choose(o.id)} />
          ))}
        </View>
      </Body>
    </LightScreen>
  );
}
