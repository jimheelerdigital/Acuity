import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { StickyBackButton } from "@/components/back-button";
import { useWhatsNewTour } from "@/components/tour/use-whats-new-tour";
import { WhatsNewList } from "@/components/whats-new/WhatsNewList";
import { useTheme } from "@/contexts/theme-context";
import { compareVersion } from "@/lib/version-check";
import { WHATS_NEW_RELEASES } from "@/lib/whats-new-content";
import { exploredCount, useWhatsNewState } from "@/lib/whats-new-state";

/**
 * Profile → What's New (and the Home pill). 1.9.1.
 *
 * This version's items with check marks for what's been explored, a
 * "Show me around" button for the guided tour, and tap-an-item to see just
 * that one. Earlier releases below as a read-only changelog.
 */
export default function WhatsNewScreen() {
  const { tokens } = useTheme();
  const router = useRouter();
  const wn = useWhatsNewState();
  const { startAll, startItem } = useWhatsNewTour();
  const platform: "ios" | "android" = Platform.OS === "ios" ? "ios" : "android";
  const current = Constants.expoConfig?.version ?? "0.0.0";

  // Releases up to the running version, newest first.
  const releases = WHATS_NEW_RELEASES.filter((r) => compareVersion(r.version, current) !== 1)
    .sort((a, b) => compareVersion(b.version, a.version))
    .map((r) => ({
      version: r.version,
      items: r.items.filter((i) => !i.platform || i.platform === platform),
    }));
  const [latest, ...earlier] = releases;
  const isCurrent = latest?.version === current;
  const { done, total } = exploredCount(wn);
  const canTour = isCurrent && !!latest?.items.some((i) => i.tour);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bg }} edges={["top"]}>
      <StickyBackButton onPress={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 56, paddingBottom: 48 }}>
        <Text style={{ fontFamily: tokens.fontDisplay, fontSize: 26, color: tokens.text, marginBottom: 6 }}>
          What's New
        </Text>

        {!latest ? (
          <Text style={{ fontFamily: tokens.fontSans, fontSize: 15, color: tokens.textSec }}>
            Nothing new to show yet.
          </Text>
        ) : (
          <>
            <Text style={{ fontFamily: tokens.fontSans, fontSize: 15, lineHeight: 22, color: tokens.textSec, marginBottom: 16 }}>
              Ripple {latest.version}
              {canTour && total > 0 ? ` · ${done} of ${total} explored` : ""}
            </Text>

            {canTour ? (
              <Pressable
                onPress={() => void startAll({ onlyUnexplored: done > 0 && done < total })}
                accessibilityRole="button"
                style={{
                  paddingVertical: 15,
                  borderRadius: 999,
                  backgroundColor: tokens.primary,
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#FFFFFF" }}>
                  {done > 0 && done < total ? "Continue the tour" : done >= total && total > 0 ? "Take the tour again" : "Show me around"}
                </Text>
              </Pressable>
            ) : null}

            <WhatsNewList
              items={latest.items}
              explored={isCurrent ? wn.explored : []}
              onItem={isCurrent ? (id) => void startItem(id) : undefined}
            />

            {earlier.map((r) => (
              <View key={r.version} style={{ marginTop: 28 }}>
                <Text
                  style={{
                    fontFamily: tokens.fontMono,
                    fontSize: 11,
                    fontWeight: "700",
                    letterSpacing: 1.4,
                    color: tokens.textTer,
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  Ripple {r.version}
                </Text>
                <WhatsNewList items={r.items} explored={[]} />
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
