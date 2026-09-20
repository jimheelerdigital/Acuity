import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/contexts/theme-context";
import { getToken } from "@/lib/auth";

/**
 * App-wide "your brief is ready" notifier.
 *
 * record.tsx polls a single entry while the record screen is mounted and
 * navigates to it on completion. But if the user leaves that screen mid-
 * processing (e.g. back to Home), that polling stops and nothing tells
 * them when the brief finishes — off-app push fires, but on-app there was
 * a gap. This provider closes it: it tracks in-flight entries independent
 * of any screen and slides a top banner in when one completes, tap to open.
 *
 * Coordination with record.tsx: record calls trackEntry on submit and
 * resolveEntry right before it navigates on completion, so the user who
 * stayed on the record screen is taken straight to the entry and never
 * sees a redundant banner. The user who left gets the banner instead.
 */

type Ctx = {
  trackEntry: (entryId: string) => void;
  resolveEntry: (entryId: string) => void;
};

const ProcessingNotifierContext = createContext<Ctx>({
  trackEntry: () => {},
  resolveEntry: () => {},
});

export function useProcessingNotifier(): Ctx {
  return useContext(ProcessingNotifierContext);
}

function apiBaseUrl(): string {
  const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;
  return (
    process.env.EXPO_PUBLIC_API_URL ?? extra?.apiUrl ?? "https://goripple.io"
  );
}

const POLL_INTERVAL_MS = 4000;
// Stop chasing an entry that never finishes — matches the record screen's
// 3-minute budget with a little slack.
const MAX_TRACK_MS = 4 * 60 * 1000;
const TOAST_VISIBLE_MS = 6000;

function isTerminal(status: string): boolean {
  return status === "COMPLETE" || status === "PARTIAL" || status === "FAILED";
}

export function ProcessingNotifierProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // entryId → epoch ms when tracking started (for the max-age cap).
  const trackedRef = useRef<Map<string, number>>(new Map());
  const pollingRef = useRef(false);
  const [toastEntryId, setToastEntryId] = useState<string | null>(null);

  const trackEntry = useCallback((entryId: string) => {
    if (!entryId) return;
    if (!trackedRef.current.has(entryId)) {
      trackedRef.current.set(entryId, Date.now());
    }
  }, []);

  const resolveEntry = useCallback((entryId: string) => {
    trackedRef.current.delete(entryId);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (cancelled || pollingRef.current) return;
      const ids = Array.from(trackedRef.current.keys());
      if (ids.length === 0) return;
      pollingRef.current = true;
      try {
        const token = await getToken();
        if (!token) return;
        for (const id of ids) {
          if (cancelled) break;
          const startedAt = trackedRef.current.get(id);
          if (startedAt == null) continue;
          if (Date.now() - startedAt > MAX_TRACK_MS) {
            trackedRef.current.delete(id);
            continue;
          }
          try {
            const res = await fetch(`${apiBaseUrl()}/api/entries/${id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) continue;
            const body = (await res.json()) as { entry?: { status?: string } };
            const status = body.entry?.status ?? "";
            if (isTerminal(status)) {
              trackedRef.current.delete(id);
              // Only celebrate real briefs; a failed one gets no banner.
              if (status !== "FAILED" && !cancelled) setToastEntryId(id);
            }
          } catch {
            // transient — leave it tracked, try again next tick
          }
        }
      } finally {
        pollingRef.current = false;
      }
    };

    const handle = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, []);

  return (
    <ProcessingNotifierContext.Provider value={{ trackEntry, resolveEntry }}>
      {children}
      {toastEntryId ? (
        <BriefReadyToast
          entryId={toastEntryId}
          onDismiss={() => setToastEntryId(null)}
        />
      ) : null}
    </ProcessingNotifierContext.Provider>
  );
}

function BriefReadyToast({
  entryId,
  onDismiss,
}: {
  entryId: string;
  onDismiss: () => void;
}) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const translateY = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    const t = setTimeout(() => {
      Animated.timing(translateY, {
        toValue: -140,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => onDismiss());
    }, TOAST_VISIBLE_MS);
    return () => clearTimeout(t);
  }, [translateY, onDismiss, entryId]);

  const open = () => {
    onDismiss();
    router.push(`/entry/${entryId}`);
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        paddingTop: insets.top + 8,
        paddingHorizontal: 16,
        transform: [{ translateY }],
        zIndex: 9999,
      }}
    >
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel="Your brief is ready — tap to view"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          borderRadius: 14,
          borderWidth: 0.5,
          borderColor: tokens.cardBorder,
          backgroundColor: tokens.cardBgRaised,
          paddingHorizontal: 16,
          paddingVertical: 14,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 6 },
          shadowRadius: 16,
          shadowOpacity: 0.18,
          elevation: 8,
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: `${tokens.primary}1f`,
          }}
        >
          <Ionicons name="sparkles" size={17} color={tokens.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: tokens.fontDisplay,
              fontSize: 15,
              color: tokens.text,
            }}
          >
            Your brief is ready
          </Text>
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 12,
              color: tokens.textSec,
              marginTop: 1,
            }}
          >
            Tap to see what Ripple caught.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={tokens.textTer} />
      </Pressable>
    </Animated.View>
  );
}
