import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { submitFeedback, type FeedbackType } from "@/lib/feedback";

/**
 * Slice O (2026-05-18). User-facing feedback modal. Surfaced from
 * Profile → "Send feedback". Sends to /api/feedback/submit (which
 * proxies to a Make.com webhook → Claude distillation → Monday.com).
 *
 * The mobile binary captures: type (bug/feature/ux/other), content
 * (textarea, ≤4000 chars). App version, OS, build number are auto-
 * appended by lib/feedback.ts from expo-constants/Platform.
 */

interface Props {
  visible: boolean;
  onClose: () => void;
}

const TYPES: Array<{
  value: FeedbackType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { value: "bug", label: "Bug", icon: "bug-outline" },
  { value: "feature", label: "Feature idea", icon: "bulb-outline" },
  { value: "ux", label: "UX / design", icon: "color-palette-outline" },
  { value: "other", label: "Other", icon: "chatbox-outline" },
];

const MAX_CHARS = 4000;

export function FeedbackModal({ visible, onClose }: Props) {
  const [type, setType] = useState<FeedbackType | null>(null);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  const canSend = !!type && content.trim().length > 0 && !sending;
  const charsLeft = MAX_CHARS - content.length;

  const reset = () => {
    setType(null);
    setContent("");
    setSending(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSend = async () => {
    if (!canSend || !type) return;
    setSending(true);
    const result = await submitFeedback({ content, type });
    setSending(false);
    if (result.ok) {
      Alert.alert(
        "Thanks",
        "We read every message. If we need more details we'll reply to your account email.",
        [{ text: "OK", onPress: handleClose }]
      );
    } else {
      Alert.alert(
        "Couldn't send",
        result.message ?? "Please try again.",
        [{ text: "OK" }]
      );
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View className="flex-1 bg-white dark:bg-[#0B0B12]">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          {/* Header */}
          <View className="flex-row items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-white/10">
            <Text className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Send feedback
            </Text>
            <Pressable
              onPress={handleClose}
              hitSlop={12}
              className="h-8 w-8 items-center justify-center rounded-full bg-zinc-100 dark:bg-white/10"
              accessibilityLabel="Close feedback"
            >
              <Ionicons name="close" size={18} color="#71717A" />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300 mb-5">
              Found a bug, have an idea, or want to tell us what
              isn&rsquo;t working? Pick a type and tell us what&rsquo;s
              up.
            </Text>

            {/* Type picker */}
            <Text className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
              What kind of feedback?
            </Text>
            <View className="flex-row flex-wrap gap-2 mb-6">
              {TYPES.map((t) => {
                const active = type === t.value;
                return (
                  <Pressable
                    key={t.value}
                    onPress={() => setType(t.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className={`flex-row items-center gap-2 rounded-full border px-4 py-2.5 ${
                      active
                        ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30"
                        : "border-zinc-200 dark:border-white/10 bg-transparent"
                    }`}
                  >
                    <Ionicons
                      name={t.icon}
                      size={16}
                      color={active ? "#A78BFA" : "#71717A"}
                    />
                    <Text
                      className={`text-sm ${
                        active
                          ? "text-violet-700 dark:text-violet-300 font-semibold"
                          : "text-zinc-700 dark:text-zinc-200"
                      }`}
                    >
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Content textarea */}
            <Text className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
              Tell us more
            </Text>
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="Describe what happened, what you expected, what you'd like to see…"
              placeholderTextColor="#71717A"
              multiline
              maxLength={MAX_CHARS}
              textAlignVertical="top"
              className="w-full min-h-40 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3 text-base text-zinc-900 dark:text-zinc-50"
              style={{ minHeight: 160 }}
              accessibilityLabel="Feedback content"
            />
            <Text className="text-xs text-zinc-400 dark:text-zinc-500 mt-1.5 text-right">
              {charsLeft.toLocaleString()} characters left
            </Text>

            {/* Privacy note */}
            <Text className="text-xs text-zinc-400 dark:text-zinc-500 mt-6 leading-relaxed">
              We&rsquo;ll see your email, app version, and OS along
              with your message so we can follow up if needed.
            </Text>
          </ScrollView>

          {/* Send button */}
          <View className="px-5 py-4 border-t border-zinc-200 dark:border-white/10">
            <Pressable
              onPress={() => void handleSend()}
              disabled={!canSend}
              className="rounded-full bg-violet-600 py-3.5 items-center"
              style={{ opacity: canSend ? 1 : 0.4 }}
            >
              <Text className="text-base font-semibold text-white">
                {sending ? "Sending…" : "Send feedback"}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
