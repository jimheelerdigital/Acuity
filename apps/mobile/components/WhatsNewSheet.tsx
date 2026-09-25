import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";

/**
 * WhatsNewSheet — one-time-per-version "here's what changed" bottom sheet,
 * shown after a user updates (Ripple 1.8, workstream 4). Content comes from the
 * release's `releaseNotes` (see lib/whats-new.ts). Restrained per the design
 * system: no glow/pulse, a plain ceremonial CTA.
 */

export interface WhatsNewSheetProps {
  version: string;
  notes: string[];
  onDismiss: () => void;
}

export function WhatsNewSheet({ version, notes, onDismiss }: WhatsNewSheetProps) {
  const { tokens } = useTheme();
  return (
    <Modal
      transparent
      visible
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            backgroundColor: tokens.cardBg,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderWidth: 1,
            borderColor: tokens.cardBorder,
            paddingHorizontal: 24,
            paddingTop: 20,
            paddingBottom: 36,
            maxHeight: "80%",
          }}
        >
          {/* grabber */}
          <View
            style={{
              alignSelf: "center",
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: tokens.line,
              marginBottom: 20,
            }}
          />

          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              textTransform: "uppercase",
              letterSpacing: 2,
              color: tokens.secondary,
              marginBottom: 8,
            }}
          >
            What's New
          </Text>
          <Text
            style={{
              fontSize: 24,
              fontWeight: "700",
              color: tokens.text,
              marginBottom: 20,
            }}
          >
            Ripple {version}
          </Text>

          <ScrollView style={{ marginBottom: 20 }}>
            {notes.map((note, i) => (
              <View
                key={`${i}-${note.slice(0, 12)}`}
                style={{ flexDirection: "row", marginBottom: 14 }}
              >
                <Text
                  style={{
                    color: tokens.secondary,
                    fontSize: 16,
                    lineHeight: 24,
                    marginRight: 10,
                  }}
                >
                  ·
                </Text>
                <Text
                  style={{
                    flex: 1,
                    fontSize: 16,
                    lineHeight: 24,
                    color: tokens.text,
                  }}
                >
                  {note}
                </Text>
              </View>
            ))}
          </ScrollView>

          <Pressable
            onPress={onDismiss}
            style={{
              paddingVertical: 16,
              borderRadius: 999,
              backgroundColor: tokens.primary,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: "600",
                color: "#FFFFFF",
                letterSpacing: 0.2,
              }}
            >
              Got it
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
