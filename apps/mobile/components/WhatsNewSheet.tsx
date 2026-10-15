import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";
import { fireHaptic } from "@/lib/haptics";
import type { WhatsNewItem } from "@/lib/whats-new-content";

/**
 * WhatsNewSheet — one-time-per-version "here's what changed" bottom sheet,
 * shown after a user updates (Ripple 1.8, workstream 4). Content comes from the
 * release's `releaseNotes` (see lib/whats-new.ts). Restrained per the design
 * system: no glow/pulse, a plain ceremonial CTA.
 */

export interface WhatsNewSheetProps {
  version: string;
  notes: string[];
  /** 1.9.1 rich items (icon, title, body, optional tap-through). */
  items?: WhatsNewItem[];
  onDismiss: () => void;
  /** Called with an item's href when it's tapped. */
  onOpen?: (href: string) => void;
}

export function WhatsNewSheet({
  version,
  notes,
  items,
  onDismiss,
  onOpen,
}: WhatsNewSheetProps) {
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
            {items?.map((item) => {
              const action = item.action;
              const tappable = !!(action && onOpen);
              return (
                <Pressable
                  key={item.title}
                  disabled={!tappable}
                  onPress={() => {
                    if (!action || !onOpen) return;
                    fireHaptic("light");
                    onOpen(action.href);
                  }}
                  accessibilityRole={tappable ? "button" : "text"}
                  accessibilityLabel={
                    tappable ? `${item.title}. ${action?.label}` : item.title
                  }
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 14,
                    paddingVertical: 12,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: `${tokens.primary}1F`,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name={item.icon} size={19} color={tokens.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "600",
                        color: tokens.text,
                        marginBottom: 2,
                      }}
                    >
                      {item.title}
                    </Text>
                    <Text style={{ fontSize: 14, lineHeight: 20, color: tokens.textSec }}>
                      {item.body}
                    </Text>
                    {tappable ? (
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "600",
                          color: tokens.primary,
                          marginTop: 6,
                        }}
                      >
                        {action?.label} ›
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
            {!items && notes.map((note, i) => (
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
