/**
 * UK/EU 14-day-withdrawal acknowledgement, shown right before a RevenueCat
 * Paywall purchase continues (see RcPaywall). Unticked by default; Continue
 * stays disabled until ticked. Wording is WITHDRAWAL_CONSENT_TEXT verbatim
 * so the stored ConsentRecord matches the screen.
 */

import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";

import { GradientCheckbox } from "@/components/acuity/GradientCheckbox";
import { useTheme } from "@/contexts/theme-context";
import { WITHDRAWAL_CONSENT_TEXT } from "@/lib/consent";

export function WithdrawalAckModal(props: {
  visible: boolean;
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { tokens } = useTheme();
  const [ticked, setTicked] = useState(false);

  // Fresh, unticked box every time it opens.
  useEffect(() => {
    if (props.visible) setTicked(false);
  }, [props.visible]);

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="fade"
      onRequestClose={props.onCancel}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.55)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            backgroundColor: tokens.bg,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 24,
            paddingBottom: 40,
            gap: 16,
          }}
        >
          <Text style={{ color: tokens.text, fontSize: 18, fontWeight: "700" }}>
            One quick confirmation
          </Text>
          <Pressable
            onPress={() => setTicked((v) => !v)}
            style={{
              flexDirection: "row",
              gap: 12,
              padding: 14,
              borderRadius: 12,
              backgroundColor: tokens.bgInset,
            }}
          >
            <GradientCheckbox
              checked={ticked}
              onPress={() => setTicked((v) => !v)}
              accessibilityLabel="I want my paid features to start now and understand the effect on my 14-day cancellation right"
            />
            <Text style={{ flex: 1, color: tokens.textSec, fontSize: 13, lineHeight: 19 }}>
              {WITHDRAWAL_CONSENT_TEXT}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!ticked || props.saving}
            onPress={props.onConfirm}
            style={{
              backgroundColor: tokens.primary,
              opacity: !ticked || props.saving ? 0.5 : 1,
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: "center",
            }}
          >
            {props.saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "700" }}>
                Continue
              </Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={props.onCancel}
            disabled={props.saving}
            style={{ alignItems: "center", paddingVertical: 6 }}
          >
            <Text style={{ color: tokens.textSec, fontSize: 15 }}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
