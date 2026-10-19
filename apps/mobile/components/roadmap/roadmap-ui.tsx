import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, Text, View } from "react-native";

import {
  ROADMAP_CATEGORY_META,
  ROADMAP_DEFAULT_BANNER,
  ROADMAP_STATUS_META,
  type RoadmapCategory,
  type RoadmapStatus,
} from "@acuity/shared";

import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";

/**
 * Shared pieces for the Roadmap list and detail screens (2026-10-19), same
 * vocabulary and colours as goripple.io/roadmap (@acuity/shared/roadmap).
 */

export type RoadmapCard = {
  id: string;
  title: string;
  summary: string;
  status: RoadmapStatus;
  category: RoadmapCategory | null;
  timeframe: string | null;
  votes: number;
  votedByMe: boolean;
  shippedVersion: string | null;
  shippedAt: string | null;
  hasDetails: boolean;
};

export type RoadmapDetail = RoadmapCard & {
  problem: string | null;
  solution: string | null;
  highlights: string[];
  howTo: string | null;
};

const CATEGORY_ICON: Record<RoadmapCategory, React.ComponentProps<typeof Ionicons>["name"]> = {
  journaling: "book-outline",
  tasks: "checkbox-outline",
  habits: "flame-outline",
  insights: "sparkles-outline",
  widgets: "grid-outline",
  account: "person-outline",
};

export function CategoryBanner({
  category,
  height = 84,
  radius = 16,
  iconSize = 30,
  roundBottom = false,
}: {
  category: RoadmapCategory | null;
  height?: number;
  radius?: number;
  iconSize?: number;
  roundBottom?: boolean;
}) {
  const c = category ? ROADMAP_CATEGORY_META[category] : ROADMAP_DEFAULT_BANNER;
  return (
    <LinearGradient
      colors={[c.from, c.to]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        height,
        alignItems: "center",
        justifyContent: "center",
        borderTopLeftRadius: radius,
        borderTopRightRadius: radius,
        borderBottomLeftRadius: roundBottom ? radius : 0,
        borderBottomRightRadius: roundBottom ? radius : 0,
      }}
    >
      <Ionicons name={category ? CATEGORY_ICON[category] : "map-outline"} size={iconSize} color="rgba(255,255,255,0.92)" />
    </LinearGradient>
  );
}

export function categoryLabel(category: RoadmapCategory | null): string | null {
  return category ? ROADMAP_CATEGORY_META[category].label : null;
}

export function StatusPill({ status }: { status: RoadmapStatus }) {
  const { tokens } = useTheme();
  const tone =
    status === "shipped"
      ? { bg: `${tokens.good}26`, fg: tokens.good }
      : status === "building"
        ? { bg: `${tokens.primary}26`, fg: tokens.primary }
        : { bg: tokens.bgSub, fg: tokens.textSec };
  return (
    <View style={{ alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: tone.bg }}>
      <Text style={{ fontFamily: tokens.fontSans, fontSize: 12, fontWeight: "700", color: tone.fg }}>
        {ROADMAP_STATUS_META[status].label}
      </Text>
    </View>
  );
}

/** "Shipped in 1.9.4 · Oct 18, 2026" / "November". */
export function contextLine(item: Pick<RoadmapCard, "status" | "shippedVersion" | "shippedAt" | "timeframe">): string | null {
  if (item.status === "shipped") {
    const parts: string[] = [];
    if (item.shippedVersion) parts.push(`Shipped in ${item.shippedVersion}`);
    if (item.shippedAt) {
      parts.push(new Date(item.shippedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }));
    }
    return parts.length ? parts.join(" · ") : "Shipped";
  }
  return item.timeframe;
}

export function VoteButton({
  item,
  busy,
  onPress,
  size = "compact",
}: {
  item: Pick<RoadmapCard, "title" | "votes" | "votedByMe">;
  busy: boolean;
  onPress: () => void;
  size?: "compact" | "large";
}) {
  const { tokens } = useTheme();
  const on = item.votedByMe;
  const large = size === "large";
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${on ? "Remove vote for" : "Vote for"} ${item.title}`}
      hitSlop={8}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: large ? 16 : 12,
        paddingVertical: large ? 12 : 8,
        borderColor: on ? tokens.primary : tokens.cardBorder,
        backgroundColor: on ? `${tokens.primary}22` : "transparent",
        opacity: busy ? 0.6 : 1,
      }}
    >
      <Ionicons name="arrow-up" size={large ? 18 : 15} color={on ? tokens.primary : tokens.textSec} />
      {large ? (
        <Text style={{ fontFamily: tokens.fontSans, fontSize: 15, fontWeight: "700", color: on ? tokens.primary : tokens.text }}>
          {on ? "You want this" : "I want this"}
        </Text>
      ) : null}
      <Text
        style={{
          fontFamily: tokens.fontSans,
          fontSize: large ? 15 : 13,
          fontWeight: "700",
          color: on ? tokens.primary : tokens.textSec,
          fontVariant: ["tabular-nums"],
        }}
      >
        {item.votes}
      </Text>
    </Pressable>
  );
}

/** Toggle the caller's vote (POST /api/roadmap/:id/vote). */
export function postVote(id: string): Promise<{ voted: boolean; votes: number }> {
  return api.post<{ voted: boolean; votes: number }>(`/api/roadmap/${id}/vote`, {});
}

export function voteErrorMessage(err: unknown): string {
  const status = (err as { status?: number }).status;
  return status === 429 ? "Slow down a little. Try again in a bit." : "Check your connection and try again.";
}
