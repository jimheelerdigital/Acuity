import { useEffect, useState } from "react";
import { View } from "react-native";

import { CARRYING } from "@/lib/onboarding-v11/copy";
import { loadAnswers, saveAnswers } from "@/lib/onboarding-v11/answers";
import { goBack, goNext, trackV11 } from "@/lib/onboarding-v11/flow";

import { Body, FunnelHeader, Heading, LightScreen, OptionTile, PROGRESS, PrimaryButton } from "./_v11/ui";

/** Miro #4 — "What are you carrying right now?" (pick all that apply). */
export default function V11Carrying() {
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    trackV11("carrying", "viewed");
    void loadAnswers().then((a) => setPicked(a.carrying));
  }, []);

  const toggle = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <LightScreen>
      <FunnelHeader progress={PROGRESS.carrying} onBack={goBack} />
      <Body
        footer={
          <PrimaryButton
            label={picked.length === 0 ? "Pick at least one" : `Continue with ${picked.length}`}
            disabled={picked.length === 0}
            onPress={() => {
              trackV11("carrying", "answered", picked.join(","));
              void saveAnswers({ carrying: picked });
              goNext("carrying");
            }}
          />
        }
      >
        <Heading title={CARRYING.title} sub={CARRYING.sub} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 }}>
          {CARRYING.options.map((o, i) => (
            <OptionTile key={o.id} index={i} icon={o.icon} label={o.label} selected={picked.includes(o.id)} onPress={() => toggle(o.id)} />
          ))}
        </View>
      </Body>
    </LightScreen>
  );
}
