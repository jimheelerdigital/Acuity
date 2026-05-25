import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Avatar } from "@/components/acuity";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";

/**
 * "People on your mind this week" — mobile parity for the web home
 * surface. Slice 8 v1.2 Anchor People.
 *
 * Fetches /api/people?withinDays=7&topN=3 — returns the top 3
 * Persons by rolling 7-day mention count. Renders nothing on empty
 * payload so disconnected/new accounts don't see a permanent empty
 * slot.
 */

interface PersonRow {
  id: string;
  displayName: string;
  mentionCount: number;
  lastMentionedAt: string | null;
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function PeopleThisWeek() {
  const router = useRouter();
  const { tokens } = useTheme();
  const [people, setPeople] = useState<PersonRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void api
      .get<{ people: PersonRow[] }>("/api/people?withinDays=7&topN=3")
      .then((res) => {
        if (!cancelled) setPeople(res.people ?? []);
      })
      .catch(() => {
        // silent — empty list is the empty-state already
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (people.length === 0) return null;

  return (
    <View style={{ marginTop: 20 }}>
      <Text
        style={{
          fontFamily: tokens.fontMono,
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 1.4,
          color: tokens.textTer,
          textTransform: "uppercase",
        }}
      >
        People on your mind this week
      </Text>
      <View style={{ marginTop: 10, gap: 8 }}>
        {people.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => router.push(`/insights/people/${p.id}` as never)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              borderRadius: tokens.radius.lg,
              backgroundColor: tokens.cardBg,
              borderWidth: 0.5,
              borderColor: tokens.cardBorder,
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
          >
            <Avatar initials={initialsFor(p.displayName)} size={36} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={{
                  fontFamily: tokens.fontDisplay,
                  fontSize: 14,
                  fontWeight: "600",
                  color: tokens.text,
                }}
                numberOfLines={1}
              >
                {p.displayName}
              </Text>
              <Text
                style={{
                  fontFamily: tokens.fontSans,
                  fontSize: 12,
                  color: tokens.textTer,
                }}
              >
                {p.mentionCount}{" "}
                {p.mentionCount === 1 ? "mention" : "mentions"} this week
              </Text>
            </View>
            <Text style={{ color: tokens.textTer, fontSize: 16 }}>›</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
