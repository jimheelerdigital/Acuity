import { useEffect } from "react";
import { Text, View } from "react-native";

import { setV10Branch, markV10Started } from "@/lib/onboarding-v10/state";
import { HOOK } from "@/lib/onboarding-v11/copy";
import { saveAnswers } from "@/lib/onboarding-v11/answers";
import { goNext, trackV11 } from "@/lib/onboarding-v11/flow";

import { StatementScreenBody } from "./_v11/statement";
import { Body, FunnelHeader, LightScreen, PROGRESS, RippleLockupCoral, Stars, V11 } from "./_v11/ui";

/** Miro #2 — the yes/no buy-in: "does your head feel too full right now?" */
export default function V11Hook() {
  useEffect(() => {
    void markV10Started();
    // The v10 screens after the debrief (reveal fallback, paywall line)
    // read a "branch". v11 asks no branch question, so use the one whose
    // copy assumes nothing about her.
    void setV10Branch("open");
    trackV11("hook", "viewed");
  }, []);

  return (
    <LightScreen>
      <FunnelHeader progress={PROGRESS.hook} />
      <Body center>
        <StatementScreenBody
          top={
            <View style={{ alignItems: "center", marginBottom: 26 }}>
              <RippleLockupCoral height={36} />
              <Text style={{ marginTop: 10, textAlign: "center", fontSize: 15, lineHeight: 21, color: V11.sec, maxWidth: 300 }}>
                {HOOK.promise}
              </Text>
            </View>
          }
          title={HOOK.title}
          statement="My head's too full and I keep forgetting things."
          mood={HOOK.mood}
          onAnswer={(v) => {
            trackV11("hook", "answered", v);
            void saveAnswers({ hook: v });
            goNext("hook");
          }}
          footnote={
            <View style={{ marginTop: 14 }}>
              <Stars label="on the App Store" />
            </View>
          }
        />
      </Body>
    </LightScreen>
  );
}
