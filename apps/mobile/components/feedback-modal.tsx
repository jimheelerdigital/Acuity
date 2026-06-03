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

import { useTheme } from "@/contexts/theme-context";
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
  const { tokens } = useTheme();
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
      <View className="flex-1" style={{ backgroundColor: tokens.bg }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          // pageSheet presentation has a top inset (~10pt) that
          // KeyboardAvoidingView doesn't auto-account for. Without
          // this offset the Send button stays buried under the
          // keyboard on iOS even though padding fires correctly.
          keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
          className="flex-1"
        >
          {/* Header */}
          <View
            className="flex-row items-center justify-between px-5 py-4 border-b"
            style={{ borderColor: tokens.line }}
          >
            <Text
              className="text-lg font-semibold"
              style={{ color: tokens.text }}
            >
              Send feedback
            </Text>
            <Pressable
              onPress={handleClose}
              hitSlop={12}
              className="h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: tokens.bgInset }}
              accessibilityLabel="Close feedback"
            >
              <Ionicons name="close" size={18} color={tokens.textTer} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text
              className="text-sm leading-relaxed mb-5"
              style={{ color: tokens.textSec }}
            >
              Found a bug, have an idea, or want to tell us what
              isn&rsquo;t working? Pick a type and tell us what&rsquo;s
              up.
            </Text>

            {/* Type picker */}
            <Text
              className="text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: tokens.textTer }}
            >
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
                    className="flex-row items-center gap-2 rounded-full border px-4 py-2.5"
                    style={{
                      borderColor: active ? tokens.primary : tokens.line,
                      backgroundColor: active
                        ? `${tokens.primary}14`
                        : "transparent",
                    }}
                  >
                    <Ionicons
                      name={t.icon}
                      size={16}
                      color={active ? tokens.primary : tokens.textTer}
                    />
                    <Text
                      className="text-sm"
                      style={{
                        color: active ? tokens.primary : tokens.textSec,
                        fontWeight: active ? "600" : "400",
                      }}
                    >
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Content textarea */}
            <Text
              className="text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: tokens.textTer }}
            >
              Tell us more
            </Text>
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="Describe what happened, what you expected, what you'd like to see…"
              placeholderTextColor={tokens.textTer}
              multiline
              maxLength={MAX_CHARS}
              textAlignVertical="top"
              className="w-full min-h-40 rounded-xl border px-4 py-3 text-base"
              style={{
                borderColor: tokens.line,
                backgroundColor: tokens.cardBg,
                color: tokens.text,
                minHeight: 160,
              }}
              accessibilityLabel="Feedback content"
            />
            <Text
              className="text-xs mt-1.5 text-right"
              style={{ color: tokens.textTer }}
            >
              {charsLeft.toLocaleString()} characters left
            </Text>

            {/* Privacy note */}
            <Text
              className="text-xs mt-6 leading-relaxed"
              style={{ color: tokens.textTer }}
            >
              We&rsquo;ll see your email, app version, and OS along
              with your message so we can follow up if needed.
            </Text>
          </ScrollView>

          {/* Send button */}
          <View
            className="px-5 py-4 border-t"
            style={{ borderColor: tokens.line }}
          >
            <Pressable
              onPress={() => void handleSend()}
              disabled={!canSend}
              className="rounded-full py-3.5 items-center"
              style={{
                backgroundColor: tokens.primary,
                opacity: canSend ? 1 : 0.4,
              }}
            >
              <Text
                className="text-base font-semibold"
                style={{ color: "#FFFFFF" }}
              >
                {sending ? "Sending…" : "Send feedback"}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
