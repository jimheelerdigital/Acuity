import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";

/**
 * CalendarEventsSection — mobile parity for the web entry-detail
 * events-that-day surface. Slice 7 v1.2 Calendar Integration.
 *
 * Fetches /api/entries/[id]/calendar-events (returns the window of
 * events around the recording + their linked flag). Renders nothing
 * when the list is empty so disconnected users never see a
 * permanent empty-state.
 *
 * Each event row carries a small + / × button that PATCHes
 * /api/entries/[id]/link-event with action=link|unlink. Optimistic
 * state: flip immediately, refetch on success.
 */

interface CalendarEvent {
  id: string;
  summary: string | null;
  startTime: string;
  endTime: string | null;
  location: string | null;
  attendees: string[];
  linked: boolean;
}

interface ApiResponse {
  events: CalendarEvent[];
}

function formatTimeRange(startIso: string, endIso: string | null): string {
  const start = new Date(startIso);
  const startStr = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  if (!endIso) return startStr;
  const end = new Date(endIso);
  const endStr = end.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${startStr} – ${endStr}`;
}

export function CalendarEventsSection({ entryId }: { entryId: string }) {
  const { tokens } = useTheme();
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .get<ApiResponse>(`/api/entries/${entryId}/calendar-events`)
      .then((res) => {
        if (cancelled) return;
        setEvents(res.events);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "fetch failed");
      });
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  if (error || !events || events.length === 0) return null;

  const toggleLink = async (eventId: string, currentlyLinked: boolean) => {
    const next = !currentlyLinked;
    // Optimistic
    setEvents((prev) =>
      (prev ?? []).map((e) =>
        e.id === eventId ? { ...e, linked: next } : e
      )
    );
    try {
      await api.patch(`/api/entries/${entryId}/link-event`, {
        eventId,
        action: next ? "link" : "unlink",
      });
    } catch {
      // Revert
      setEvents((prev) =>
        (prev ?? []).map((e) =>
          e.id === eventId ? { ...e, linked: currentlyLinked } : e
        )
      );
    }
  };

  return (
    <View style={{ marginTop: 24 }}>
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
        Calendar events that day · {events.length}
      </Text>
      <View style={{ marginTop: 10, gap: 8 }}>
        {events.map((e) => {
          const visible = e.attendees.slice(0, 3);
          const extra = Math.max(0, e.attendees.length - visible.length);
          return (
            <View
              key={e.id}
              style={{
                borderRadius: tokens.radius.lg,
                backgroundColor: tokens.cardBgTint,
                borderWidth: 0.5,
                borderColor: tokens.cardBorder,
                paddingHorizontal: 16,
                paddingVertical: 14,
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: tokens.fontDisplay,
                      fontSize: 15,
                      fontWeight: "600",
                      color: tokens.text,
                    }}
                  >
                    {e.summary?.trim() || "(no title)"}
                  </Text>
                  {e.linked && (
                    <View
                      style={{
                        backgroundColor: tokens.goodSoft,
                        borderRadius: tokens.radius.pill,
                        paddingHorizontal: 6,
                        paddingVertical: 1,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: tokens.fontMono,
                          fontSize: 9,
                          fontWeight: "700",
                          letterSpacing: 1.2,
                          textTransform: "uppercase",
                          color: tokens.good,
                        }}
                      >
                        Linked
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  style={{
                    fontFamily: tokens.fontSans,
                    fontSize: 13,
                    color: tokens.textSec,
                  }}
                >
                  {formatTimeRange(e.startTime, e.endTime)}
                  {e.location ? ` · ${e.location}` : ""}
                </Text>
                {visible.length > 0 && (
                  <Text
                    style={{
                      fontFamily: tokens.fontSans,
                      fontSize: 12,
                      color: tokens.textTer,
                    }}
                  >
                    with {visible.join(", ")}
                    {extra > 0 ? ` +${extra} more` : ""}
                  </Text>
                )}
              </View>
              <Pressable
                onPress={() => toggleLink(e.id, e.linked)}
                accessibilityLabel={
                  e.linked ? "Unlink this event" : "Link this event"
                }
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  borderWidth: 0.5,
                  borderColor: tokens.cardBorder,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: tokens.textSec,
                    fontSize: 16,
                    lineHeight: 16,
                  }}
                >
                  {e.linked ? "×" : "+"}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
