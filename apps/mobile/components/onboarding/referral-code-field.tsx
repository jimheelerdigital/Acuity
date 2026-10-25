/**
 * "Were you referred?" — optional referral code on the onboarding save
 * screen and the sign-up screen (creator platform, 2026-10-22, Road 2 of
 * attribution). Shown as a visible question ABOVE the sign-in buttons
 * (Jimmy 2026-10-25: it sat below the email form, collapsed, and nobody saw
 * it). User-facing copy says "referred"/"referral", never "creator".
 *
 * The code is checked live against GET /api/creators/code (no auth; shows
 * "Referred by Tess") and kept on the device; applyPendingSetup() sends it to
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

export interface ReferralColors {
  text: string;
  sec: string;
  ter: string;
  quiet: string;
  line: string;
  inputBg: string;
  good: string;
  bad: string;
  accent: string;
}

const DEFAULT_COLORS: ReferralColors = {
  text: V11.ink,
  sec: V11.sec,
  ter: V11.ter,
  quiet: V11.quiet,
  line: V11.lineStrong,
  inputBg: "#ffffff",
  good: V11.good,
  bad: "#C2412D",
  accent: V11.coral,
};

export function ReferralCodeField({ colors = DEFAULT_COLORS }: { colors?: ReferralColors }) {
  const c = colors;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [check, setCheck] = useState<Check>({ state: "idle" });
  const seq = useRef(0);
  // Nothing is written until the saved code has been read back; otherwise
  // the first render's empty value clears the stored code before the
  // restore below can load it.
  const [restored, setRestored] = useState(false);

  // Restore a code typed before a cold start / back-navigation.
  useEffect(() => {
    void loadAnswers()
      .then((a) => {
        if (a.creatorCode) {
          setOpen(true);
          setValue(a.creatorCode);
        }
      })
      .finally(() => setRestored(true));
  }, []);

  useEffect(() => {
    if (!restored) return;
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
          setCheck({ state: "valid", firstName: j.firstName ?? "your friend", code: j.code });
          void saveAnswers({ creatorCode: j.code });
        } else {
          setCheck({ state: "invalid", message: j.message ?? "We couldn't find that referral code. Check the spelling and try again." });
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
  }, [value, restored]);

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Were you referred? Add a referral code"
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderWidth: 1,
          borderColor: c.line,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 12,
          backgroundColor: c.inputBg,
        }}
      >
        <Text style={{ fontSize: 15, color: c.text }}>Were you referred?</Text>
        <Text style={{ fontSize: 15, color: c.accent, fontWeight: "600" }}>Add code</Text>
      </Pressable>
    );
  }

  const border = check.state === "valid" ? c.good : check.state === "invalid" ? c.bad : c.line;

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, color: c.sec, fontFamily: V11.display }}>Referral code (optional)</Text>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder="e.g. TESS"
          placeholderTextColor={c.quiet}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          maxLength={16}
          accessibilityLabel="Referral code"
          style={{
            flex: 1,
            backgroundColor: c.inputBg,
            borderWidth: 1,
            borderColor: border,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 16,
            letterSpacing: 1.4,
            color: c.text,
          }}
        />
        {check.state === "checking" ? (
          <ActivityIndicator style={{ position: "absolute", right: 14 }} color={c.ter} />
        ) : null}
      </View>
      {check.state === "valid" ? (
        <Text style={{ fontSize: 13, color: c.good }}>Referred by {check.firstName}. Thanks for telling us.</Text>
      ) : check.state === "invalid" ? (
        <Text style={{ fontSize: 13, color: c.bad }}>{check.message}</Text>
      ) : (
        <Text style={{ fontSize: 12, color: c.ter }}>It doesn&apos;t change your price. It tells us who sent you.</Text>
      )}
    </View>
  );
}
