import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { isV10Guest } from "@/lib/onboarding-v10/state";
import { hasProEntitlement } from "@/lib/revenuecat";

/**
 * 1.9.1: people who subscribed in 1.9.0 without ever making an account
 * ("Later" in the old funnel) hold their purchase on an anonymous
 * RevenueCat ID. If they lose the phone or reinstall, it's gone from their
 * point of view. When such a guest opens the app, ask them to create an
 * account: signing in runs Purchases.logIn(userId) (auth-context), which
 * moves the anonymous purchase onto the account.
 *
 * Only for signed-out guests whose device holds an active `pro`
 * entitlement. "Not now" hides it until the next launch.
 */
export function AnonymousSubscriberPrompt() {
  const { user, loading } = useAuth();
  const { tokens } = useTheme();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (loading || user) {
      setVisible(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      if (!(await isV10Guest())) return;
      const pro = await hasProEntitlement();
      if (!cancelled && pro === true) setVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => setVisible(false)}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.55)",
          justifyContent: "center",
          paddingHorizontal: 24,
        }}
      >
        <View style={{ backgroundColor: tokens.cardBg, borderRadius: 22, padding: 22 }}>
          <Text style={{ color: tokens.text, fontSize: 20, fontWeight: "700", marginBottom: 8 }}>
            Save your subscription to an account
          </Text>
          <Text style={{ color: tokens.textSec, fontSize: 15, lineHeight: 21, marginBottom: 18 }}>
            You subscribed without an account, so your subscription only lives on this phone. Create one
            with Apple, Google or your email — it takes a few seconds — and your subscription and
            debriefs are safe on any device.
          </Text>
          <Pressable
            onPress={() => {
              setVisible(false);
              router.push("/(auth)/sign-up");
            }}
            accessibilityRole="button"
            style={{
              backgroundColor: tokens.text,
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: "center",
            }}
          >
            <Text style={{ color: tokens.bg, fontSize: 15, fontWeight: "600" }}>Create account</Text>
          </Pressable>
          <Pressable
            onPress={() => setVisible(false)}
            accessibilityRole="button"
            style={{ paddingVertical: 14, alignItems: "center" }}
          >
            <Text style={{ color: tokens.textSec, fontSize: 14 }}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
