import { useEffect } from "react";

import { SOUND } from "@/lib/onboarding-v11/copy";
import { saveAnswers } from "@/lib/onboarding-v11/answers";
import { goBack, goNext, trackV11 } from "@/lib/onboarding-v11/flow";

import { StatementScreenBody } from "./_v11/statement";
import { Body, FunnelHeader, LightScreen, PROGRESS } from "./_v11/ui";

/** Miro #5 — "Does this sound like you?" 'Things I say I'll do slip for weeks.' */
export default function V11Sound() {
  useEffect(() => {
    trackV11("sound", "viewed");
  }, []);

  return (
    <LightScreen>
      <FunnelHeader progress={PROGRESS.sound} onBack={goBack} />
      <Body center>
        <StatementScreenBody
          eyebrow={SOUND.eyebrow}
          title={SOUND.title}
          statement={SOUND.statement}
          mood={SOUND.mood}
          onAnswer={(v) => {
            trackV11("sound", "answered", v);
            void saveAnswers({ sound: v });
            goNext("sound");
          }}
        />
      </Body>
    </LightScreen>
  );
}
