import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { APP_NAME } from "@acuity/shared";

import { useTheme } from "@/contexts/theme-context";
import { WARN_AMBER } from "@/lib/tone-colors";

/**
 * Type-to-confirm account deletion modal. The destructive button only
 * enables when the user types DELETE in capital letters — universal
 * pattern that works for email-based and Apple-private-relay accounts
 * alike (private-relay addresses are long random strings that are
 * hostile to retype on mobile).
 *
 * Apple Guideline 5.1.1(v) requires this flow to be reachable from
 * inside the app. Wired from apps/mobile/app/(tabs)/profile.tsx.
 */

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: string; status?: number };

const CONFIRM_PHRASE = "DELETE";

type Props = {
  visible: boolean;
  isPro: boolean;
  /**
   * Subscription source ("stripe" | "apple" | "google_play" | null). Gates the
   * PRO block below: its "Cancel your subscription immediately" copy + Stripe
   * Customer Portal CTA are only TRUE for Stripe subs. For store-owned
   * (Apple/Google) subs we can't cancel server-side, so that block is hidden
   * and the always-on store warning above is the correct, non-contradictory
   * message.
   */
  subscriptionSource: string | null;
  /**
   * Days left in the current paid period — derived from
   * user.stripeCurrentPeriodEnd. Null when the user isn't PRO, when
   * the field is missing, or when the calculation can't be trusted
   * (negative, NaN). The modal shows "X days remaining" when this is
   * non-null and falls back to softer copy otherwise.
   */
  daysRemaining: number | null;
  onClose: () => void;
  onDelete: () => Promise<DeleteAccountResult>;
  /** Called once the deletion succeeds AND local session is cleared. */
  onDeleted: () => void;
  /**
   * Tapping the "Cancel subscription instead" CTA inside the PRO
   * warning. Modal closes itself first via onClose, then the parent
   * fires this to open the Stripe Customer Portal.
   */
  onCancelSubscription: () => void;
};

export function DeleteAccountModal({
  visible,
  isPro,
  subscriptionSource,
  daysRemaining,
  onClose,
  onDelete,
  onDeleted,
  onCancelSubscription,
}: Props) {
  const { tokens } = useTheme();
  // Store-owned subs can't be cancelled server-side, so the Stripe-specific
  // PRO block below must not claim we cancel them "immediately".
  const isIapSub =
    subscriptionSource === "apple" || subscriptionSource === "google_play";
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset every time the modal is opened so a re-open after a cancel
  // doesn't show stale state.
  useEffect(() => {
    if (visible) {
      setConfirmText("");
      setSubmitting(false);
      setError(null);
    }
  }, [visible]);

  const matches = confirmText === CONFIRM_PHRASE;

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
        style={{ flex: 1, backgroundColor: tokens.bg }}
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
            borderBottomColor: tokens.line,
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
                color: submitting ? tokens.textQuiet : tokens.textSec,
              }}
            >
              Cancel
            </Text>
          </Pressable>
          <Text
            style={{
              fontSize: 16,
              fontWeight: "600",
              color: tokens.text,
            }}
          >
            Delete account
          </Text>
          <View style={{ width: 50 }} />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
        >
          {/* Warning icon + headline */}
          <View style={{ alignItems: "center", marginTop: 20, marginBottom: 24 }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: `${tokens.bad}1f`,
                borderWidth: 1,
                borderColor: `${tokens.bad}66`,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <Ionicons name="trash-outline" size={28} color={tokens.bad} />
            </View>
            <Text
              style={{
                fontSize: 22,
                fontWeight: "600",
                color: tokens.text,
                textAlign: "center",
                letterSpacing: -0.3,
              }}
            >
              This will permanently delete your account.
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: tokens.textSec,
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
              backgroundColor: tokens.cardBg,
              borderWidth: 0.5,
              borderColor: tokens.line,
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
                color: tokens.textTer,
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

          {/* Always-on subscription warning — shown to EVERY user, never gated
              on isPro/subscriptionStatus. That local field can read FREE while a
              real store subscription is still live (dunning drift) — which is
              exactly how a paying user deleted and kept getting billed. Store
              subscriptions can ONLY be cancelled by the user in store settings. */}
          <View
            style={{
              backgroundColor: `${WARN_AMBER}14`,
              borderWidth: 0.5,
              borderColor: `${WARN_AMBER}66`,
              borderRadius: 14,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Ionicons
                name="card-outline"
                size={20}
                color={WARN_AMBER}
                style={{ marginTop: 1 }}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: WARN_AMBER,
                    marginBottom: 6,
                  }}
                >
                  Have a paid subscription? Deleting won&rsquo;t always stop it.
                </Text>
                <Text
                  style={{ fontSize: 13, color: tokens.textSec, lineHeight: 19 }}
                >
                  If you subscribed through the{" "}
                  {Platform.OS === "ios" ? "App Store" : "Play Store"}, your
                  subscription is billed by{" "}
                  {Platform.OS === "ios" ? "Apple" : "Google"} and only you can
                  cancel it — deleting your {APP_NAME} account does{" "}
                  <Text style={{ fontWeight: "700" }}>not</Text> cancel it.
                  Cancel it in your store settings.
                </Text>
                <Pressable
                  onPress={() =>
                    void Linking.openURL(
                      Platform.OS === "ios"
                        ? "itms-apps://apps.apple.com/account/subscriptions"
                        : "https://play.google.com/store/account/subscriptions"
                    )
                  }
                  style={{
                    marginTop: 12,
                    paddingVertical: 12,
                    borderRadius: 10,
                    backgroundColor: `${WARN_AMBER}22`,
                    borderWidth: 1,
                    borderColor: `${WARN_AMBER}80`,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{ fontSize: 14, fontWeight: "600", color: WARN_AMBER }}
                  >
                    Manage subscriptions in Settings
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* PRO subscription warning — explicit forfeiture + alt CTA.
              The warning-amber tone (WARN_AMBER) signals "stop and
              consider this" without triggering destructive-red, which
              is reserved for the actual Delete confirm action below.
              Gated on !isIapSub: for store-owned subs we can't cancel and the
              always-on warning above is the truthful message — showing this
              "we cancel immediately" block too would contradict it. */}
          {isPro && !isIapSub && (
            <View
              style={{
                backgroundColor: `${WARN_AMBER}14`,
                borderWidth: 0.5,
                borderColor: `${WARN_AMBER}66`,
                borderRadius: 14,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Ionicons
                  name="alert-circle-outline"
                  size={20}
                  color={WARN_AMBER}
                  style={{ marginTop: 1 }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: WARN_AMBER,
                      marginBottom: 8,
                    }}
                  >
                    You&rsquo;re on PRO. Deleting your account will:
                  </Text>
                  <ProBullet
                    text="Cancel your subscription immediately (no refund for unused time)"
                    bulletColor={WARN_AMBER}
                  />
                  <ProBullet
                    text={
                      daysRemaining !== null
                        ? `Forfeit the rest of your current paid period (${daysRemaining} ${
                            daysRemaining === 1 ? "day" : "days"
                          } remaining)`
                        : "Forfeit the rest of your current paid period"
                    }
                    bulletColor={WARN_AMBER}
                  />
                  <ProBullet
                    text="Permanently delete all your data"
                    bulletColor={WARN_AMBER}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      color: tokens.textSec,
                      lineHeight: 18,
                      marginTop: 10,
                    }}
                  >
                    If you just want to stop paying, cancel your
                    subscription instead — your account stays and you
                    keep access until the period ends.
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() => {
                  if (submitting) return;
                  onCancelSubscription();
                }}
                disabled={submitting}
                style={{
                  marginTop: 12,
                  paddingVertical: 12,
                  borderRadius: 10,
                  backgroundColor: `${tokens.primary}30`,
                  borderWidth: 1,
                  borderColor: `${tokens.primary}80`,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: tokens.primary,
                  }}
                >
                  Cancel subscription instead
                </Text>
              </Pressable>
            </View>
          )}

          {/* Type-to-confirm — DELETE in caps */}
          <View style={{ marginTop: 8, marginBottom: 16 }}>
            <Text
              style={{
                fontSize: 13,
                color: tokens.textSec,
                marginBottom: 10,
              }}
            >
              To confirm, type{" "}
              <Text style={{ color: tokens.text, fontWeight: "700" }}>
                DELETE
              </Text>{" "}
              below.
            </Text>
            <TextInput
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder=""
              placeholderTextColor={tokens.textTer}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
              editable={!submitting}
              accessibilityLabel="Type DELETE to confirm"
              style={{
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: 10,
                backgroundColor: tokens.bgInset,
                borderWidth: 1,
                borderColor: matches ? `${tokens.good}80` : tokens.line,
                color: tokens.text,
                fontSize: 16,
                letterSpacing: 1.2,
              }}
            />
          </View>

          {/* Error surface */}
          {error && (
            <View
              style={{
                backgroundColor: `${tokens.bad}1a`,
                borderWidth: 0.5,
                borderColor: `${tokens.bad}66`,
                borderRadius: 10,
                padding: 12,
                marginBottom: 16,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  color: tokens.bad,
                  lineHeight: 18,
                }}
              >
                {error}
              </Text>
            </View>
          )}

          {/* Confirm button — destructive red. tokens.bad re-skins
              to the palette's red ember; the disabled state uses
              the same color at lower alpha so the "I'm about to
              delete" signal stays even when the button is gated. */}
          <Pressable
            onPress={handleConfirm}
            disabled={!matches || submitting}
            style={{
              paddingVertical: 14,
              borderRadius: 12,
              backgroundColor:
                !matches || submitting ? `${tokens.bad}4d` : tokens.bad,
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
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function ProBullet({
  text,
  bulletColor,
}: {
  text: string;
  bulletColor: string;
}) {
  const { tokens } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
        marginBottom: 4,
      }}
    >
      <Text style={{ color: bulletColor, fontSize: 13, lineHeight: 18 }}>
        •
      </Text>
      <Text
        style={{
          flex: 1,
          fontSize: 13,
          color: tokens.textSec,
          lineHeight: 18,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

function DeletedItem({ text }: { text: string }) {
  const { tokens } = useTheme();
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
        color={`${tokens.bad}b3`}
        style={{ marginTop: 1 }}
      />
      <Text
        style={{
          flex: 1,
          fontSize: 13,
          color: tokens.textSec,
          lineHeight: 18,
        }}
      >
        {text}
      </Text>
    </View>
  );
}
