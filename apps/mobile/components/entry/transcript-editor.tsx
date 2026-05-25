import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";

/**
 * Inline transcript editor for the mobile entry detail screen.
 * Slice 3 v1.2 entry editing — mobile parity for the web component.
 *
 * Read mode: shows the transcript + a small "Edit" affordance.
 * Edit mode: multi-line TextInput + Save / Cancel.
 * Reprocessing: calm card with "Re-processing…" + a poll loop that
 * calls /api/entries/[id] every 2s until reprocessingStartedAt
 * clears, then calls onReprocessComplete so the parent screen
 * re-fetches.
 *
 * Apple-compliance: editing your own data is core functionality,
 * never invokes a purchase prompt.
 */

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 90_000;

export interface TranscriptEditorProps {
  entryId: string;
  initialTranscript: string;
  reprocessing: boolean;
  /** Parent re-fetches the entry when this fires so the new
   *  derived state (themes, mood, etc.) re-renders. */
  onReprocessComplete: () => void;
}

export function TranscriptEditor({
  entryId,
  initialTranscript,
  reprocessing: initialReprocessing,
  onReprocessComplete,
}: TranscriptEditorProps) {
  const { tokens } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialTranscript);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reprocessing, setReprocessing] = useState(initialReprocessing);
  const inputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    if (editing) {
      // Defer focus a tick so the input is mounted before we ask
      // the OS to bring up the keyboard.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editing]);

  useEffect(() => {
    if (!reprocessing) return;
    let cancelled = false;
    const startedAt = Date.now();

    const tick = async () => {
      if (cancelled) return;
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        if (!cancelled) {
          setReprocessing(false);
          onReprocessComplete();
        }
        return;
      }
      try {
        const res = await api.get<{
          entry: { status: string; reprocessingStartedAt: string | null };
        }>(`/api/entries/${entryId}`);
        if (
          !res.entry.reprocessingStartedAt &&
          res.entry.status === "COMPLETE" &&
          !cancelled
        ) {
          setReprocessing(false);
          onReprocessComplete();
          return;
        }
      } catch {
        // Keep polling — next tick may succeed.
      }
      if (!cancelled) setTimeout(tick, POLL_INTERVAL_MS);
    };

    const id = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [reprocessing, entryId, onReprocessComplete]);

  const save = async () => {
    const next = draft.trim();
    if (next.length === 0) {
      setError("Transcript can't be empty.");
      return;
    }
    if (next === initialTranscript.trim()) {
      setEditing(false);
      setError(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = await api.patch<{
        reprocessing?: boolean;
        noChange?: boolean;
        error?: string;
      }>(`/api/entries/${entryId}`, { transcript: next });
      setEditing(false);
      if (body.reprocessing) {
        setReprocessing(true);
      } else {
        onReprocessComplete();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setDraft(initialTranscript);
    setEditing(false);
    setError(null);
  };

  if (reprocessing) {
    return (
      <View
        style={{
          borderRadius: tokens.radius.lg,
          backgroundColor: tokens.cardBgTint,
          borderWidth: 0.5,
          borderColor: tokens.cardBorder,
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
      >
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
          Re-processing…
        </Text>
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 14,
            lineHeight: 21,
            color: tokens.textSec,
            marginTop: 6,
          }}
        >
          Acuity is re-deriving themes, mood, and people mentions
          from your edited transcript. About 30 seconds.
        </Text>
      </View>
    );
  }

  if (!editing) {
    return (
      <View>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
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
            Transcript
          </Text>
          <Pressable
            onPress={() => setEditing(true)}
            accessibilityLabel="Edit transcript"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              borderRadius: tokens.radius.pill,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <Ionicons name="pencil-outline" size={12} color={tokens.textTer} />
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 12,
                fontWeight: "500",
                color: tokens.textTer,
              }}
            >
              Edit
            </Text>
          </Pressable>
        </View>
        <View
          style={{
            borderRadius: tokens.radius.lg,
            backgroundColor: tokens.cardBgTint,
            borderWidth: 0.5,
            borderColor: tokens.cardBorder,
            paddingHorizontal: 16,
            paddingVertical: 14,
          }}
        >
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 14,
              lineHeight: 22,
              color: tokens.textSec,
            }}
          >
            {initialTranscript || "Transcript still processing…"}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View>
      <Text
        style={{
          fontFamily: tokens.fontMono,
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 1.4,
          color: tokens.textTer,
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        Editing transcript
      </Text>
      <View
        style={{
          borderRadius: tokens.radius.lg,
          backgroundColor: tokens.cardBgTint,
          borderWidth: 0.5,
          borderColor: tokens.cardBorder,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          multiline
          textAlignVertical="top"
          editable={!saving}
          style={{
            minHeight: 160,
            fontFamily: tokens.fontSans,
            fontSize: 14,
            lineHeight: 22,
            color: tokens.text,
          }}
        />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            marginTop: 14,
            flexWrap: "wrap",
          }}
        >
          <Pressable
            onPress={() => void save()}
            disabled={saving}
            style={{
              backgroundColor: tokens.text,
              borderRadius: tokens.radius.pill,
              paddingHorizontal: 14,
              paddingVertical: 8,
              opacity: saving ? 0.6 : 1,
            }}
          >
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 13,
                fontWeight: "600",
                color: tokens.bg,
              }}
            >
              {saving ? "Saving…" : "Save changes"}
            </Text>
          </Pressable>
          <Pressable onPress={cancel} disabled={saving}>
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 13,
                fontWeight: "500",
                color: tokens.textTer,
              }}
            >
              Cancel
            </Text>
          </Pressable>
        </View>
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 11,
            color: tokens.textTer,
            marginTop: 8,
          }}
        >
          Saving rebuilds themes, mood, and people mentions from the
          edited text.
        </Text>
        {error && (
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 12,
              color: tokens.bad,
              marginTop: 8,
            }}
          >
            {error}
          </Text>
        )}
      </View>
    </View>
  );
}
