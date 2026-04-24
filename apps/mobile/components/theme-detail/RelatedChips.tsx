import { Pressable, ScrollView, Text, View } from "react-native";

type Sentiment = "positive" | "neutral" | "challenging";

const DOT: Record<Sentiment, string> = {
  positive: "#34D399",
  challenging: "#F87171",
  neutral: "#94A3B8",
};

/**
 * Horizontally-scrolling pill chips for related themes. Each chip:
 * sentiment dot + theme name + small count. Tapping navigates to
 * that theme's detail page.
 */
export function RelatedChips({
  items,
  onTap,
}: {
  items: Array<{
    id: string;
    name: string;
    count: number;
    sentiment?: Sentiment;
  }>;
  onTap: (id: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingVertical: 2 }}
    >
      {items.map((r) => {
        const tone = r.sentiment ?? "neutral";
        return (
          <Pressable
            key={r.id}
            onPress={() => onTap(r.id)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 14,
              paddingVertical: 9,
              borderRadius: 999,
              backgroundColor: "rgba(30,30,46,0.7)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.06)",
            }}
          >
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 3.5,
                backgroundColor: DOT[tone],
              }}
            />
            <Text
              style={{ fontSize: 13, color: "#E4E4E7", fontWeight: "500" }}
            >
              {sentenceCase(r.name)}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: "rgba(161,161,170,0.65)",
              }}
            >
              ×{r.count}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function sentenceCase(s: string): string {
  if (!s) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
