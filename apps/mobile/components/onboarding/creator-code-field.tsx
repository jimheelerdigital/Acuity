/**
 * "Did a creator send you?" — optional creator referral code on the
 * onboarding save screen (creator platform, 2026-10-22, Road 2 of
 * attribution). Collapsed to one quiet link by default so it never competes
 * with sign-up.
 *
 * The code is checked live against GET /api/creators/code (no auth; shows
 * "Sent by Tess") and kept on the device; applyPendingSetup() sends it to
 * POST /api/creators/code right after the account exists. Any case, spaces
 * and dashes are fine; the server forgives O/0 and I/L/1 look-alikes.
 */
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { api } from "@/lib/api";
import { loadAnswers, saveAnswers } from "@/lib/onboarding-v11/answers";

import { V11 } from "@/app/onboarding-new/_v11/ui";

type Check =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "valid"; firstName: string; code: string }
  | { state: "invalid"; message: string };

function clean(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-_.]/g, "");
}

export function CreatorCodeField() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [check, setCheck] = useState<Check>({ state: "idle" });
  const seq = useRef(0);

  // Restore a code typed before a cold start / back-navigation.
  useEffect(() => {
    void loadAnswers().then((a) => {
      if (a.creatorCode) {
        setOpen(true);
        setValue(a.creatorCode);
      }
    });
  }, []);

  useEffect(() => {
    const code = clean(value);
    if (code.length < 4) {
      setCheck({ state: "idle" });
      void saveAnswers({ creatorCode: undefined });
      return;
    }
    const mine = ++seq.current;
    setCheck({ state: "checking" });
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${api.baseUrl()}/api/creators/code?code=${encodeURIComponent(code)}`);
        const j = (await res.json()) as { valid?: boolean; firstName?: string; code?: string; message?: string };
        if (mine !== seq.current) return;
        if (j.valid && j.code) {
          setCheck({ state: "valid", firstName: j.firstName ?? "a creator", code: j.code });
          void saveAnswers({ creatorCode: j.code });
        } else {
          setCheck({ state: "invalid", message: j.message ?? "That code doesn't match a Ripple creator." });
          void saveAnswers({ creatorCode: undefined });
        }
      } catch {
        if (mine !== seq.current) return;
        // Offline: keep what she typed; the server validates after sign-up.
        setCheck({ state: "idle" });
        void saveAnswers({ creatorCode: code });
      }
    }, 450);
    return () => clearTimeout(t);
  }, [value]);

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Did a creator send you? Enter their code"
        style={{ alignSelf: "center", paddingVertical: 8 }}
      >
        <Text style={{ fontSize: 13, color: V11.ter, textDecorationLine: "underline" }}>
          Did a creator send you? Enter their code
        </Text>
      </Pressable>
    );
  }

  const border =
    check.state === "valid" ? V11.good : check.state === "invalid" ? "#C2412D" : V11.lineStrong;

  return (
    <View style={{ gap: 6, marginTop: 4 }}>
      <Text style={{ fontSize: 13, color: V11.sec, fontFamily: V11.display }}>Creator code (optional)</Text>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder="e.g. TESS"
          placeholderTextColor={V11.quiet}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          maxLength={16}
          accessibilityLabel="Creator code"
          style={{
            flex: 1,
            backgroundColor: "#ffffff",
            borderWidth: 1,
            borderColor: border,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 16,
            letterSpacing: 1.4,
            color: V11.ink,
          }}
        />
        {check.state === "checking" ? (
          <ActivityIndicator style={{ position: "absolute", right: 14 }} color={V11.ter} />
        ) : null}
      </View>
      {check.state === "valid" ? (
        <Text style={{ fontSize: 13, color: V11.good }}>Sent by {check.firstName}. Thanks for telling us.</Text>
      ) : check.state === "invalid" ? (
        <Text style={{ fontSize: 13, color: "#C2412D" }}>{check.message}</Text>
      ) : (
        <Text style={{ fontSize: 12, color: V11.ter }}>It doesn&apos;t change your price. It tells us who sent you.</Text>
      )}
    </View>
  );
}
