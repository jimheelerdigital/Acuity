import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { StickyBackButton } from "@/components/back-button";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";

/**
 * Ask Your Past Self — native screen (Ripple 1.8, workstream 3).
 *
 * Replaces the old WebBrowser bounce. Asks a natural-language question
 * across the user's journal and renders the answer + the entries it drew
 * from, all against the existing POST /api/insights/ask-past endpoint
 * (Bearer auth via lib/api). No new backend.
 */

interface Citation {
  id: string;
  createdAt: string;
  excerpt: string;
  score?: number;
}

interface AskResponse {
  answer: string;
  citedEntries: Citation[];
  meta?: { totalEmbeddedEntries?: number };
}

const MIN_LEN = 5;
const MAX_LEN = 500;
// ask-past embeds the question then calls Claude — 20-30s on a cold path.
const ASK_TIMEOUT_MS = 60_000;

const SUGGESTIONS = [
  "What patterns keep coming up for me?",
  "What have I been grateful for lately?",
  "What's been weighing on me this month?",
  "When did I feel most like myself?",
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function errorMessage(status: number | undefined, timeout: boolean): string {
  if (timeout) return "That took too long. Check your connection and try again.";
  switch (status) {
    case 401:
      return "Please sign in again to use Ask.";
    case 404:
      return "Ask isn't available on your account yet.";
    case 429:
      return "You've reached today's limit of 10 questions. Try again tomorrow.";
    case 400:
      return "That question was too short or too long — try rephrasing.";
    case 503:
      return "Something hiccuped on our end. Give it another try in a moment.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export default function AskPastSelfScreen() {
  const router = useRouter();
  const { tokens } = useTheme();

  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(null);

  const trimmed = question.trim();
  const canAsk = trimmed.length >= MIN_LEN && !loading;

  async function ask() {
    if (!canAsk) return;
    Keyboard.dismiss();
    setLoading(true);
    setError(null);
    setResult(null);
    setAsked(trimmed);
    try {
      const res = await api.post<AskResponse>(
        "/api/insights/ask-past",
        { question: trimmed },
        undefined,
        { timeoutMs: ASK_TIMEOUT_MS }
      );
      setResult(res);
    } catch (err) {
      const e = err as Error & { status?: number; timeout?: boolean };
      setError(errorMessage(e.status, Boolean(e.timeout)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: tokens.bg }}>
      <StickyBackButton onPress={() => router.back()} />
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
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
          Ask
        </Text>
        <Text
          style={{
            fontSize: 26,
            fontWeight: "700",
            color: tokens.text,
            marginBottom: 8,
          }}
        >
          Ask Your Past Self
        </Text>
        <Text
          style={{
            fontSize: 15,
            lineHeight: 22,
            color: tokens.textSec,
            marginBottom: 20,
          }}
        >
          Ask anything about your journal — the answer is drawn only from
          your own entries.
        </Text>

        <TextInput
          value={question}
          onChangeText={setQuestion}
          placeholder="e.g. What patterns keep coming up for me?"
          placeholderTextColor={tokens.textSec}
          multiline
          maxLength={MAX_LEN}
          editable={!loading}
          style={{
            minHeight: 96,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: tokens.line,
            backgroundColor: tokens.cardBg,
            color: tokens.text,
            padding: 14,
            fontSize: 16,
            lineHeight: 22,
            textAlignVertical: "top",
          }}
        />

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 10,
          }}
        >
          <Text style={{ fontSize: 12, color: tokens.textSec }}>
            {trimmed.length}/{MAX_LEN}
          </Text>
          <Pressable
            onPress={ask}
            disabled={!canAsk}
            style={{
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 999,
              backgroundColor: tokens.primary,
              opacity: canAsk ? 1 : 0.5,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: "#FFFFFF",
                letterSpacing: 0.2,
              }}
            >
              {loading ? "Thinking…" : "Ask"}
            </Text>
          </Pressable>
        </View>

        {/* ── Body states ─────────────────────────────────────────── */}
        {loading && (
          <View style={{ alignItems: "center", marginTop: 40 }}>
            <ActivityIndicator color={tokens.primary} />
            <Text style={{ marginTop: 12, fontSize: 14, color: tokens.textSec }}>
              Reading your journal…
            </Text>
          </View>
        )}

        {!loading && error && (
          <View
            style={{
              marginTop: 20,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: tokens.line,
              backgroundColor: tokens.bgSub,
              padding: 16,
            }}
          >
            <Text style={{ fontSize: 15, lineHeight: 22, color: tokens.bad }}>
              {error}
            </Text>
          </View>
        )}

        {!loading && !error && result && (
          <View style={{ marginTop: 24 }}>
            {asked && (
              <Text
                style={{
                  fontSize: 13,
                  fontStyle: "italic",
                  color: tokens.textSec,
                  marginBottom: 10,
                }}
              >
                You asked: {asked}
              </Text>
            )}
            <View
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: tokens.cardBorder,
                backgroundColor: tokens.cardBg,
                padding: 16,
              }}
            >
              <Text style={{ fontSize: 16, lineHeight: 24, color: tokens.text }}>
                {result.answer}
              </Text>
            </View>

            {result.citedEntries.length > 0 && (
              <>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    textTransform: "uppercase",
                    letterSpacing: 1.5,
                    color: tokens.textSec,
                    marginTop: 24,
                    marginBottom: 10,
                  }}
                >
                  From these entries
                </Text>
                {result.citedEntries.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => router.push(`/entry/${c.id}` as never)}
                    style={{
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: tokens.line,
                      backgroundColor: tokens.bgSub,
                      padding: 14,
                      marginBottom: 10,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: tokens.secondary,
                        marginBottom: 6,
                      }}
                    >
                      {formatDate(c.createdAt)}
                    </Text>
                    <Text
                      style={{ fontSize: 14, lineHeight: 20, color: tokens.text }}
                      numberOfLines={4}
                    >
                      {c.excerpt}
                    </Text>
                  </Pressable>
                ))}
              </>
            )}
          </View>
        )}

        {!loading && !error && !result && (
          <View style={{ marginTop: 28 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                textTransform: "uppercase",
                letterSpacing: 1.5,
                color: tokens.textSec,
                marginBottom: 12,
              }}
            >
              Try asking
            </Text>
            {SUGGESTIONS.map((s) => (
              <Pressable
                key={s}
                onPress={() => setQuestion(s)}
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: tokens.line,
                  backgroundColor: tokens.bgSub,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  marginBottom: 10,
                  alignSelf: "flex-start",
                }}
              >
                <Text style={{ fontSize: 14, color: tokens.textSec }}>{s}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
