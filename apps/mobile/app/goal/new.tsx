import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LIFE_AREAS, lifeAreaDisplayLabel } from "@acuity/shared";

import { api } from "@/lib/api";
import { invalidate } from "@/lib/cache";
import { useTheme } from "@/contexts/theme-context";
import { DueDateField } from "@/components/due-date-field";

const GOALS_TREE_KEY = "/api/goals/tree";
const GOALS_TREE_ARCHIVED_KEY = "/api/goals/tree?includeArchived=1";

// Field caps mirror the server bounds enforced by /api/goals
// (title 200, description 2000) so the user never types past what the
// API will accept.
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;

/**
 * Manual goal creation as an Expo Router modal — the create counterpart
 * to goal/[id].tsx (which is edit-only). Mirrors the manual-task-add
 * pattern (task/new.tsx). Fields: title (required), description, target
 * date (native picker, US-format display), life area. POSTs to
 * /api/goals — the same one-shape contract the web "New goal" flow uses
 * (lifeArea always sent; server default is GROWTH if ever omitted).
 *
 * Opened from the "+" in the Goals tab header. Registered as
 * presentation: "modal" in app/_layout.tsx.
 */
export default function GoalCreateScreen() {
  const router = useRouter();
  const { tokens } = useTheme();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [target, setTarget] = useState(""); // YYYY-MM-DD or ""
  const [lifeArea, setLifeArea] = useState("GROWTH"); // = server default
  const [saving, setSaving] = useState(false);

  const canSave = title.trim().length > 0 && !saving;

  const save = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      Alert.alert("Title required");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/goals", {
        title: trimmed,
        description: description.trim() || null,
        targetDate: target || null,
        lifeArea,
      });
      // Bust both goal-tree caches so the Goals tab shows the new goal
      // when this modal closes.
      invalidate(GOALS_TREE_KEY);
      invalidate(GOALS_TREE_ARCHIVED_KEY);
      router.back();
    } catch (err) {
      Alert.alert(
        "Couldn't add goal",
        err instanceof Error ? err.message : "Try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView
      className="flex-1"
      edges={["top"]}
      style={{ backgroundColor: tokens.bg }}
    >
      <View
        className="flex-row items-center justify-between px-5 pt-2 pb-3 border-b"
        style={{ borderColor: tokens.line }}
      >
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text className="text-sm" style={{ color: tokens.textSec }}>
            Cancel
          </Text>
        </Pressable>
        <Text className="text-base font-semibold" style={{ color: tokens.text }}>
          New goal
        </Text>
        <Pressable onPress={save} disabled={!canSave} hitSlop={10}>
          <Text
            className="text-sm font-semibold"
            style={{ color: canSave ? tokens.primary : tokens.textTer }}
          >
            {saving ? "Adding…" : "Add"}
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Title */}
          <Text
            className="text-xs font-medium mb-1"
            style={{ color: tokens.textSec }}
          >
            Title
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            autoFocus
            maxLength={TITLE_MAX}
            placeholder="What are you working toward?"
            placeholderTextColor={tokens.textTer}
            selectionColor={tokens.primary}
            className="rounded-lg border px-3 py-2.5 text-sm mb-4"
            style={{
              borderColor: tokens.line,
              backgroundColor: tokens.bgInset,
              color: tokens.text,
              minHeight: 42,
            }}
          />

          {/* Description */}
          <Text
            className="text-xs font-medium mb-1"
            style={{ color: tokens.textSec }}
          >
            Description
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            maxLength={DESCRIPTION_MAX}
            selectionColor={tokens.primary}
            className="rounded-lg border px-3 py-2.5 text-sm mb-4"
            style={{
              borderColor: tokens.line,
              backgroundColor: tokens.bgInset,
              color: tokens.text,
              minHeight: 80,
              textAlignVertical: "top",
            }}
          />

          {/* Target date — native calendar picker, US-format display. */}
          <Text
            className="text-xs font-medium mb-1"
            style={{ color: tokens.textSec }}
          >
            Target date (optional)
          </Text>
          <View className="mb-4">
            <DueDateField value={target} onChange={setTarget} />
          </View>

          {/* Life area */}
          <Text
            className="text-xs font-medium mb-1.5"
            style={{ color: tokens.textSec }}
          >
            Life area
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {LIFE_AREAS.map((area) => {
              const active = lifeArea === area;
              return (
                <Pressable
                  key={area}
                  onPress={() => setLifeArea(area)}
                  className="rounded-lg px-3 py-2"
                  style={{
                    backgroundColor: active
                      ? `${tokens.primary}22`
                      : "transparent",
                    borderWidth: 1,
                    borderColor: active ? tokens.primary : tokens.line,
                  }}
                >
                  <Text
                    className="text-xs"
                    style={{
                      color: active ? tokens.primary : tokens.textSec,
                      fontWeight: active ? "600" : "400",
                    }}
                  >
                    {lifeAreaDisplayLabel(area)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
