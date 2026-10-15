import { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { router } from "expo-router";

import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { loadAnswers, saveAnswers } from "@/lib/onboarding-v11/answers";
import { goNext, hrefFor, trackV11 } from "@/lib/onboarding-v11/flow";

import { Body, Card, FunnelHeader, Heading, IconTile, LightScreen, PROGRESS, PrimaryButton, V11 } from "./_v11/ui";

/**
 * "What should Ripple call you?" — only shown when the sign-in gave us no
 * name (email code never does; Apple only on the first authorization). The
 * year plan and the paywall greet her by it.
 */
export default function V11Name() {
  const { user, setAuthenticatedUser } = useAuth();
  const [v, setV] = useState(user?.name?.trim().split(/\s+/)[0] ?? "");
  // Sign-in already gave us a name (Apple, Google, or a returning email):
  // don't ask again — straight on to the first question.
  // Read once at mount: saving a typed name below updates `user`, and that
  // must not trigger a second navigation.
  const [known] = useState(() => user?.name?.trim().split(/\s+/)[0] || null);

  useEffect(() => {
    if (!known) return;
    void saveAnswers({ firstName: known });
    router.replace(hrefFor("hook"));
  }, [known]);

  useEffect(() => {
    if (known) return;
    trackV11("name", "viewed");
    void loadAnswers().then((a) => {
      if (a.firstName) setV((cur) => cur || a.firstName || "");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const first = v.trim().split(/\s+/)[0] ?? "";

  const save = () => {
    const name = v.trim().slice(0, 40);
    trackV11("name", "answered", name ? "given" : "skipped");
    if (name) {
      void saveAnswers({ firstName: name.split(/\s+/)[0] });
      if (user) setAuthenticatedUser({ ...user, name });
      void api.post("/api/user/name", { name }).catch(() => {});
    }
    goNext("name");
  };

  if (known) return <LightScreen>{null}</LightScreen>;

  return (
    <LightScreen>
      <FunnelHeader progress={PROGRESS.name} />
      <Body footer={<PrimaryButton label={v.trim() ? "Continue" : "Skip for now"} onPress={save} />}>
        <Heading title="What should Ripple call you?" sub="Your plan will be made for you." />
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 8 }}>
          <IconTile name="user" on={false} size={46} />
          <TextInput
            value={v}
            onChangeText={setV}
            onSubmitEditing={save}
            placeholder="First name"
            placeholderTextColor={V11.quiet}
            autoComplete="given-name"
            textContentType="givenName"
            autoCapitalize="words"
            returnKeyType="done"
            autoFocus
            maxLength={40}
            style={{ flex: 1, fontSize: 19, fontWeight: "500", color: V11.ink, paddingVertical: 12 }}
          />
        </Card>
        <View style={{ marginTop: 22, opacity: first ? 1 : 0 }}>
          <Text style={{ textAlign: "center", fontFamily: V11.display, fontSize: 18, color: V11.ink }}>
            Nice to meet you, <Text style={{ color: V11.coral }}>{first || "friend"}</Text>.
          </Text>
        </View>
      </Body>
    </LightScreen>
  );
}
