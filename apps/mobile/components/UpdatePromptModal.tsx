import { Modal, Pressable, Text, View } from "react-native";

import type { VersionCheckConfig } from "@/lib/version-check";

/**
 * UpdatePromptModal — STUB. Slice 2 ships the wiring (lib +
 * overlay controller) with this minimal renderer so the layout
 * builds and the launch flow can be tested end-to-end. Slice 3
 * replaces the body of this file with the canonical HeroCard /
 * gradient blob / fade-up entrance treatment.
 *
 * Per slice 2 contract: receive `config`, `isForced`, `onDismiss`;
 * render headline + body + buttons; tap "Update" → noop (slice 4
 * adds App Store URL handling); tap "Later" → onDismiss.
 */

export interface UpdatePromptModalProps {
  config: VersionCheckConfig;
  isForced: boolean;
  onDismiss: () => void;
}

export function UpdatePromptModal({
  config,
  isForced,
  onDismiss,
}: UpdatePromptModalProps) {
  return (
    <Modal
      transparent
      animationType="fade"
      visible
      onRequestClose={isForced ? undefined : onDismiss}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
      >
        <View
          style={{
            backgroundColor: "#1E1E2E",
            borderRadius: 28,
            padding: 24,
            maxWidth: 360,
            width: "100%",
          }}
        >
          <Text
            style={{
              color: "#FAFAFA",
              fontSize: 22,
              fontWeight: "700",
              marginBottom: 12,
            }}
          >
            {config.headline}
          </Text>
          <Text
            style={{
              color: "rgba(255,255,255,0.7)",
              fontSize: 15,
              lineHeight: 22,
              marginBottom: 24,
            }}
          >
            {config.body}
          </Text>
          <Pressable
            onPress={() => {
              // Slice 4 wires App Store deep-link handling here.
            }}
            style={{
              backgroundColor: "#F89A6E",
              paddingVertical: 14,
              borderRadius: 999,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
              {config.ctaText}
            </Text>
          </Pressable>
          {!isForced && config.dismissible && (
            <Pressable
              onPress={onDismiss}
              style={{
                paddingVertical: 14,
                marginTop: 8,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: "rgba(255,255,255,0.6)",
                  fontWeight: "600",
                  fontSize: 14,
                }}
              >
                Later
              </Text>
            </Pressable>
          )}
          {isForced && (
            <Text
              style={{
                color: "rgba(255,255,255,0.4)",
                fontSize: 12,
                textAlign: "center",
                marginTop: 16,
              }}
            >
              This update is required to continue.
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}
