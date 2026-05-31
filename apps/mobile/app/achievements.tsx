/**
 * Achievements grid screen — linked from Profile → Activity →
 * Achievements. Three sections (Consistency / Reflection / Moment)
 * each rendering a 3-column grid of badges. Tap a badge to open a
 * bottom-sheet with title, description, earned date or "Locked",
 * tier, and points.
 *
 * Data: GET /api/achievements once on mount. No realtime updates
 * needed — newly-earned badges land via the CelebrationModal queue,
 * and a back-nav refresh re-reads the catalog.
 */

import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BadgeSvg } from "@/components/achievements/BadgeSvg";
import { useTheme } from "@/contexts/theme-context";
import {
  fetchCatalog,
  type CatalogItem,
  type CatalogResponse,
} from "@/lib/achievements-api";

type Section = {
  key: "CONSISTENCY" | "REFLECTION" | "MOMENT";
  title: string;
  items: CatalogItem[];
};

const SECTION_ORDER: Array<{ key: Section["key"]; title: string }> = [
  { key: "CONSISTENCY", title: "Consistency" },
  { key: "REFLECTION", title: "Reflection" },
  { key: "MOMENT", title: "Moment" },
];

const TIER_LABEL: Record<number, string> = {
  1: "Bronze",
  2: "Silver",
  3: "Gold",
  4: "Platinum",
  5: "Diamond",
};

export default function AchievementsScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CatalogItem | null>(null);

  useEffect(() => {
    fetchCatalog()
      .then((res) => setData(res))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const sections: Section[] = useMemo(() => {
    if (!data) return [];
    return SECTION_ORDER.map(({ key, title }) => ({
      key,
      title,
      items: data.items.filter((i) => i.category === key),
    })).filter((s) => s.items.length > 0);
  }, [data]);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: tokens.bg }}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: tokens.bg },
          headerTintColor: tokens.text,
          title: "Achievements",
          headerTitleStyle: { fontFamily: tokens.fontSans, fontWeight: "600" },
        }}
      />

      {loading ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator color={tokens.primary} />
        </View>
      ) : !data ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 24,
          }}
        >
          <Text style={{ color: tokens.textTer, textAlign: "center" }}>
            Couldn&apos;t load achievements. Pull down to retry, or check
            your connection.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          {/* Totals header */}
          <View
            style={{
              marginBottom: 24,
              borderRadius: tokens.radius.lg,
              borderWidth: 0.5,
              borderColor: tokens.line,
              backgroundColor: tokens.cardBg,
              padding: 18,
            }}
          >
            <Text
              style={{
                fontFamily: tokens.fontMono,
                fontSize: 10,
                fontWeight: "700",
                letterSpacing: 1.4,
                textTransform: "uppercase",
                color: tokens.textTer,
                marginBottom: 6,
              }}
            >
              Lifetime
            </Text>
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 28,
                fontWeight: "700",
                color: tokens.text,
              }}
            >
              {data.totals.points} pts
            </Text>
            <Text
              style={{
                marginTop: 4,
                fontFamily: tokens.fontSans,
                fontSize: 13,
                color: tokens.textTer,
              }}
            >
              {data.totals.earned} of {data.totals.total} earned
            </Text>
          </View>

          {sections.map((section) => (
            <View key={section.key} style={{ marginBottom: 28 }}>
              <Text
                style={{
                  fontFamily: tokens.fontMono,
                  fontSize: 10,
                  fontWeight: "700",
                  letterSpacing: 1.4,
                  textTransform: "uppercase",
                  color: tokens.textTer,
                  marginBottom: 12,
                }}
              >
                {section.title}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                {section.items.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => setSelected(item)}
                    accessibilityRole="button"
                    accessibilityLabel={item.title}
                    style={{
                      width: "30%",
                      alignItems: "center",
                      paddingVertical: 6,
                    }}
                  >
                    <BadgeSvg
                      slug={item.slug}
                      state={item.earned ? "earned" : "locked"}
                      size={92}
                    />
                    <Text
                      style={{
                        marginTop: 6,
                        fontFamily: tokens.fontSans,
                        fontSize: 12,
                        fontWeight: "600",
                        color: item.earned ? tokens.text : tokens.textTer,
                        textAlign: "center",
                      }}
                      numberOfLines={2}
                    >
                      {item.title}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Bottom-sheet for selected badge */}
      <Modal
        visible={selected !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
        statusBarTranslucent
      >
        <Pressable
          onPress={() => setSelected(null)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          {selected && (
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                backgroundColor: tokens.bgSub,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                padding: 24,
                paddingBottom: 36,
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: tokens.line,
                  marginBottom: 16,
                }}
              />
              <BadgeSvg
                slug={selected.slug}
                state={selected.earned ? "earned" : "locked"}
                size={140}
              />
              <Text
                style={{
                  marginTop: 16,
                  fontFamily: tokens.fontSans,
                  fontSize: 22,
                  fontWeight: "700",
                  color: tokens.text,
                  textAlign: "center",
                }}
              >
                {selected.title}
              </Text>
              <Text
                style={{
                  marginTop: 8,
                  fontFamily: tokens.fontSans,
                  fontSize: 14,
                  lineHeight: 21,
                  color: tokens.textSec,
                  textAlign: "center",
                  maxWidth: 320,
                }}
              >
                {selected.description}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 8,
                  justifyContent: "center",
                  marginTop: 20,
                }}
              >
                <Chip
                  text={selected.earned ? "Earned" : "Locked"}
                  color={selected.earned ? tokens.good : tokens.textTer}
                  bg={selected.earned ? `${tokens.good}1A` : tokens.bgInset}
                  tokens={tokens}
                />
                <Chip
                  text={`${TIER_LABEL[selected.tier] ?? `Tier ${selected.tier}`}`}
                  color={tokens.primary}
                  bg={`${tokens.primary}1A`}
                  tokens={tokens}
                />
                <Chip
                  text={`${selected.pointsAwarded ?? selected.points} pts`}
                  color={tokens.text}
                  bg={tokens.bgInset}
                  tokens={tokens}
                />
              </View>
              {selected.earned && selected.earnedAt && (
                <Text
                  style={{
                    marginTop: 14,
                    fontFamily: tokens.fontMono,
                    fontSize: 11,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                    color: tokens.textTer,
                  }}
                >
                  Earned {new Date(selected.earnedAt).toLocaleDateString()}
                </Text>
              )}
              <Pressable
                onPress={() => setSelected(null)}
                accessibilityRole="button"
                style={{
                  marginTop: 24,
                  paddingHorizontal: 28,
                  paddingVertical: 12,
                  borderRadius: 999,
                  backgroundColor: tokens.primary,
                }}
              >
                <Text
                  style={{
                    fontFamily: tokens.fontSans,
                    fontSize: 14,
                    fontWeight: "600",
                    color: "#FFFFFF",
                  }}
                >
                  Close
                </Text>
              </Pressable>
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Chip({
  text,
  color,
  bg,
  tokens,
}: {
  text: string;
  color: string;
  bg: string;
  tokens: { fontSans: string };
}) {
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: bg,
      }}
    >
      <Text
        style={{
          fontFamily: tokens.fontSans,
          fontSize: 12,
          fontWeight: "600",
          color,
        }}
      >
        {text}
      </Text>
    </View>
  );
}
