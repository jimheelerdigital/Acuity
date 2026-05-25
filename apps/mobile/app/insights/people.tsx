import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Avatar } from "@/components/acuity";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";

/**
 * /insights/people — mobile parity for the web directory. Slice 8.
 *
 * Fetches GET /api/people, renders a sorted list of cards. Client-
 * side substring filter on displayName. Tap → /insights/people/[id]
 * for the detail screen.
 *
 * Accountability voice copy mirrors web: frequency over judgment,
 * never characterizes the user's relationships.
 */

interface PersonRow {
  id: string;
  displayName: string;
  mentionCount: number;
  lastMentionedAt: string;
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

export default function PeopleDirectoryScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .get<{ people: PersonRow[] }>("/api/people")
      .then((res) => {
        if (cancelled) return;
        setPeople(res.people);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "fetch failed");
        setPeople([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!people) return [];
    const norm = query.trim().toLowerCase();
    if (!norm) return people;
    return people.filter((p) => p.displayName.toLowerCase().includes(norm));
  }, [people, query]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
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
          People
        </Text>
        <Text
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 28,
            fontWeight: "700",
            color: tokens.text,
            marginTop: 8,
          }}
        >
          Who you think about, anchored over time
        </Text>
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 14,
            lineHeight: 21,
            color: tokens.textSec,
            marginTop: 8,
          }}
        >
          Names that come up in your reflections. Frequency, not
          judgment — just what you&apos;re carrying.
        </Text>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Filter by name…"
          placeholderTextColor={tokens.textTer}
          style={{
            marginTop: 20,
            borderRadius: tokens.radius.lg,
            borderWidth: 0.5,
            borderColor: tokens.cardBorder,
            backgroundColor: tokens.cardBg,
            paddingHorizontal: 14,
            paddingVertical: 10,
            color: tokens.text,
            fontFamily: tokens.fontSans,
            fontSize: 14,
          }}
        />

        {people === null ? (
          <View style={{ marginTop: 40, alignItems: "center" }}>
            <ActivityIndicator color={tokens.textSec} />
          </View>
        ) : filtered.length === 0 ? (
          <View
            style={{
              marginTop: 20,
              padding: 20,
              borderRadius: tokens.radius.xl,
              backgroundColor: tokens.cardBg,
              borderWidth: 0.5,
              borderColor: tokens.cardBorder,
            }}
          >
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 14,
                lineHeight: 21,
                color: tokens.textSec,
              }}
            >
              {error
                ? "Couldn't load people. Try again in a moment."
                : query.trim()
                ? "No matches."
                : "Acuity hasn't surfaced anyone yet. People show up here once you've mentioned them across a few entries."}
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: 16, gap: 8 }}>
            {filtered.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => router.push(`/insights/people/${p.id}` as never)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  borderRadius: tokens.radius.lg,
                  backgroundColor: tokens.cardBgTint,
                  borderWidth: 0.5,
                  borderColor: tokens.cardBorder,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                }}
              >
                <Avatar initials={initialsFor(p.displayName)} size={40} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    style={{
                      fontFamily: tokens.fontDisplay,
                      fontSize: 15,
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
                    Mentioned {p.mentionCount}{" "}
                    {p.mentionCount === 1 ? "time" : "times"} · last{" "}
                    {relativeTime(p.lastMentionedAt)}
                  </Text>
                </View>
                <Text style={{ color: tokens.textTer, fontSize: 16 }}>›</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
