import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { WhatsNewList } from "@/components/whats-new/WhatsNewList";
import { useTheme } from "@/contexts/theme-context";
import type { WhatsNewItem } from "@/lib/whats-new-content";

/**
 * WhatsNewSheet — the "here's what changed" bottom sheet shown once after an
 * update (1.8; 1.9.1 adds the tour). Content: bundled items
 * (lib/whats-new-content.ts) or, as a fallback, the server's releaseNotes.
 *
 * 1.9.1: "Show me around" runs the guided tour; tapping an item runs just
 * that stop. Either way the list stays reachable afterwards from the Home
 * pill and Profile → What's New. Static styles only.
 */

export interface WhatsNewSheetProps {
  version: string;
  notes: string[];
  items?: WhatsNewItem[];
  explored?: string[];
  onDismiss: () => void;
  onItem?: (itemId: string) => void;
  onTour?: () => void;
}

export function WhatsNewSheet({
  version,
  notes,
  items,
  explored = [],
  onDismiss,
  onItem,
  onTour,
}: WhatsNewSheetProps) {
  const { tokens } = useTheme();
  const canTour = !!onTour && !!items?.some((i) => i.tour);
  return (
    <Modal transparent visible animationType="slide" onRequestClose={onDismiss}>
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
            maxHeight: "85%",
          }}
        >
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
          <Text style={{ fontSize: 24, fontWeight: "700", color: tokens.text, marginBottom: 12 }}>
            Ripple {version}
          </Text>

          <ScrollView style={{ marginBottom: 16 }}>
            {items ? (
              <WhatsNewList items={items} explored={explored} onItem={onItem} />
            ) : (
              notes.map((note, i) => (
                <View key={`${i}-${note.slice(0, 12)}`} style={{ flexDirection: "row", marginBottom: 14 }}>
                  <Text style={{ color: tokens.secondary, fontSize: 16, lineHeight: 24, marginRight: 10 }}>
                    ·
                  </Text>
                  <Text style={{ flex: 1, fontSize: 16, lineHeight: 24, color: tokens.text }}>{note}</Text>
                </View>
              ))
            )}
          </ScrollView>

          <Pressable
            onPress={canTour ? onTour : onDismiss}
            accessibilityRole="button"
            style={{
              paddingVertical: 16,
              borderRadius: 999,
              backgroundColor: tokens.primary,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "600", color: "#FFFFFF", letterSpacing: 0.2 }}>
              {canTour ? "Show me around" : "Got it"}
            </Text>
          </Pressable>
          {canTour ? (
            <Pressable
              onPress={onDismiss}
              accessibilityRole="button"
              hitSlop={8}
              style={{ alignSelf: "center", paddingVertical: 12, marginTop: 4 }}
            >
              <Text style={{ fontSize: 14, color: tokens.textSec }}>
                Not now — it's in Profile anytime
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
