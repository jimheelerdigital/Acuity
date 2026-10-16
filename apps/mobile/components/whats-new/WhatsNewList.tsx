import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";
import { fireHaptic } from "@/lib/haptics";
import type { WhatsNewItem } from "@/lib/whats-new-content";

/**
 * The What's New item list (1.9.1) — shared by the update sheet and the
 * Profile → What's New page. Items with a tour stop are tappable (runs
 * that stop) and get a green check once explored. Static styles only
 * (NativeWind drops function-form Pressable styles).
 */
export function WhatsNewList({
  items,
  explored,
  onItem,
}: {
  items: WhatsNewItem[];
  explored: string[];
  /** Omit to render read-only (e.g. past releases). */
  onItem?: (itemId: string) => void;
}) {
  const { tokens } = useTheme();
  return (
    <View>
      {items.map((item) => {
        const tappable = !!(item.tour && onItem);
        const done = explored.includes(item.id);
        return (
          <Pressable
            key={item.id}
            disabled={!tappable}
            onPress={() => {
              if (!onItem) return;
              fireHaptic("light");
              onItem(item.id);
            }}
            accessibilityRole={tappable ? "button" : "text"}
            accessibilityLabel={`${item.title}${done ? ", explored" : ""}${tappable ? ". Show me" : ""}`}
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 14,
              paddingVertical: 12,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: done ? `${tokens.good}22` : `${tokens.primary}1F`,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name={done ? "checkmark" : item.icon}
                size={19}
                color={done ? tokens.good : tokens.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: tokens.text, marginBottom: 2 }}>
                {item.title}
              </Text>
              <Text style={{ fontSize: 14, lineHeight: 20, color: tokens.textSec }}>
                {item.body}
              </Text>
              {tappable ? (
                <Text style={{ fontSize: 14, fontWeight: "600", color: tokens.primary, marginTop: 6 }}>
                  {done ? "Show me again ›" : "Show me ›"}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
