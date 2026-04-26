import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Type-to-confirm account deletion modal. Three-pane progressive
 * disclosure so the user has to acknowledge what gets removed before
 * the destructive button enables:
 *
 *   1. Warning  — list of what gets deleted; PRO users also see the
 *      "your active subscription will cancel immediately" caveat.
 *   2. Type-to-confirm — text input that must match the user's email
 *      exactly (case-insensitive). Submit button stays disabled until
 *      it matches.
 *   3. Loading / error — spinner while the network call is in flight,
 *      surface a friendly error if the server refuses (rate limit,
 *      400 mismatch, 500 etc).
 *
 * Apple Guideline 5.1.1(v) requires this flow to be reachable from
 * inside the app. Wired from apps/mobile/app/(tabs)/profile.tsx.
 */

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: string; status?: number };

type Props = {
  visible: boolean;
  email: string;
  isPro: boolean;
  onClose: () => void;
  onDelete: () => Promise<DeleteAccountResult>;
  /** Called once the deletion succeeds AND local session is cleared. */
  onDeleted: () => void;
};

export function DeleteAccountModal({
  visible,
  email,
  isPro,
  onClose,
  onDelete,
  onDeleted,
}: Props) {
  const [confirmEmail, setConfirmEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset every time the modal is opened so a re-open after a cancel
  // doesn't show stale state.
  useEffect(() => {
    if (visible) {
      setConfirmEmail("");
      setSubmitting(false);
      setError(null);
    }
  }, [visible]);

  const matches =
    confirmEmail.trim().toLowerCase() === email.trim().toLowerCase();

  const handleConfirm = async () => {
    if (!matches || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await onDelete();
    if (result.ok) {
      onDeleted();
    } else {
      setError(result.error);
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        if (!submitting) onClose();
      }}
    >
      <SafeAreaView
        style={{ flex: 1, backgroundColor: "#0B0B12" }}
        edges={["top", "bottom"]}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 16,
            borderBottomWidth: 0.5,
            borderBottomColor: "rgba(255,255,255,0.06)",
          }}
        >
          <Pressable
            onPress={() => !submitting && onClose()}
            disabled={submitting}
            hitSlop={8}
          >
            <Text
              style={{
                fontSize: 16,
                color: submitting ? "rgba(168,168,180,0.4)" : "#A1A1AA",
              }}
            >
              Cancel
            </Text>
          </Pressable>
          <Text
            style={{
              fontSize: 16,
              fontWeight: "600",
              color: "#FAFAFA",
            }}
          >
            Delete account
          </Text>
          <View style={{ width: 50 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Warning icon + headline */}
          <View style={{ alignItems: "center", marginTop: 20, marginBottom: 24 }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: "rgba(239,68,68,0.12)",
                borderWidth: 1,
                borderColor: "rgba(239,68,68,0.4)",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <Ionicons
                name="trash-outline"
                size={28}
                color="#EF4444"
              />
            </View>
            <Text
              style={{
                fontSize: 22,
                fontWeight: "600",
                color: "#FAFAFA",
                textAlign: "center",
                letterSpacing: -0.3,
              }}
            >
              This will permanently delete your account.
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: "rgba(168,168,180,0.8)",
                textAlign: "center",
                marginTop: 10,
                lineHeight: 20,
              }}
            >
              This can&rsquo;t be undone. We&rsquo;ll remove everything
              tied to your account from our servers.
            </Text>
          </View>

          {/* What gets deleted */}
          <View
            style={{
              backgroundColor: "rgba(255,255,255,0.03)",
              borderWidth: 0.5,
              borderColor: "rgba(255,255,255,0.08)",
              borderRadius: 14,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                letterSpacing: 1.6,
                color: "rgba(168,168,180,0.6)",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              What gets removed
            </Text>
            <DeletedItem text="Every voice recording and its audio file" />
            <DeletedItem text="Every transcript, summary, and AI extraction" />
            <DeletedItem text="Your Life Matrix, weekly reports, and Life Audits" />
            <DeletedItem text="Themes, goals, tasks, and insights history" />
            <DeletedItem text="Notification preferences and reminders" />
          </View>

          {/* PRO subscription warning */}
          {isPro && (
            <View
              style={{
                backgroundColor: "rgba(252,168,90,0.08)",
                borderWidth: 0.5,
                borderColor: "rgba(252,168,90,0.4)",
                borderRadius: 14,
                padding: 16,
                marginBottom: 16,
                flexDirection: "row",
                gap: 12,
              }}
            >
              <Ionicons
                name="alert-circle-outline"
                size={20}
                color="#FCA85A"
                style={{ marginTop: 1 }}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: "#FCA85A",
                    marginBottom: 4,
                  }}
                >
                  You have an active subscription
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: "rgba(228,228,231,0.85)",
                    lineHeight: 18,
                  }}
                >
                  Deleting your account cancels your subscription
                  immediately. You won&rsquo;t be billed again.
                </Text>
              </View>
            </View>
          )}

          {/* Type-to-confirm */}
          <View style={{ marginTop: 8, marginBottom: 16 }}>
            <Text
              style={{
                fontSize: 13,
                color: "rgba(228,228,231,0.85)",
                marginBottom: 10,
              }}
            >
              To confirm, type your email below:{" "}
              <Text style={{ color: "#FAFAFA", fontWeight: "600" }}>
                {email}
              </Text>
            </Text>
            <TextInput
              value={confirmEmail}
              onChangeText={setConfirmEmail}
              placeholder="your.email@example.com"
              placeholderTextColor="rgba(168,168,180,0.4)"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={Platform.OS === "ios" ? "email-address" : "default"}
              editable={!submitting}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: 10,
                backgroundColor: "rgba(255,255,255,0.04)",
                borderWidth: 1,
                borderColor: matches
                  ? "rgba(34,197,94,0.5)"
                  : "rgba(255,255,255,0.08)",
                color: "#FAFAFA",
                fontSize: 16,
              }}
            />
          </View>

          {/* Error surface */}
          {error && (
            <View
              style={{
                backgroundColor: "rgba(239,68,68,0.1)",
                borderWidth: 0.5,
                borderColor: "rgba(239,68,68,0.4)",
                borderRadius: 10,
                padding: 12,
                marginBottom: 16,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  color: "#FCA5A5",
                  lineHeight: 18,
                }}
              >
                {error}
              </Text>
            </View>
          )}

          {/* Confirm button */}
          <Pressable
            onPress={handleConfirm}
            disabled={!matches || submitting}
            style={{
              paddingVertical: 14,
              borderRadius: 12,
              backgroundColor:
                !matches || submitting ? "rgba(239,68,68,0.3)" : "#DC2626",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 10,
              marginTop: 8,
            }}
          >
            {submitting && (
              <ActivityIndicator size="small" color="#FFFFFF" />
            )}
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: "#FFFFFF",
              }}
            >
              {submitting ? "Deleting…" : "Delete my account"}
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function DeletedItem({ text }: { text: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        marginBottom: 6,
      }}
    >
      <Ionicons
        name="close-circle"
        size={16}
        color="rgba(239,68,68,0.7)"
        style={{ marginTop: 1 }}
      />
      <Text
        style={{
          flex: 1,
          fontSize: 13,
          color: "rgba(228,228,231,0.85)",
          lineHeight: 18,
        }}
      >
        {text}
      </Text>
    </View>
  );
}
