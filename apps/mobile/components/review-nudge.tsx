import { useEffect, useState, useCallback } from "react";
import { AppState, Modal, Pressable, Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";
import { FeedbackModal } from "@/components/feedback-modal";
import {
  shouldShowNudge,
  markNudgeShown,
  markRated,
  turnOffNudges,
  requestReview,
} from "@/lib/review";

/**
 * "Enjoying Ripple?" nudge — App Store / Play compliant.
 *
 * Mount once (in the tabs layout). It arms only after a positive signal
 * (completed debriefs), is frequency-capped, and offers: rate (native OS
 * prompt), leave feedback (existing modal), or dismiss. No stars UI, no
 * incentive, no "5 stars" — those violate store rules. See lib/review.ts.
 */
export function ReviewNudge() {
  const { tokens } = useTheme();
  const [visible, setVisible] = useState(false);
  const [feedback, setFeedback] = useState(false);

  const maybeArm = useCallback(async () => {
    if (await shouldShowNudge()) {
      await markNudgeShown();
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    void maybeArm();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void maybeArm();
    });
    return () => sub.remove();
  }, [maybeArm]);

  const onRate = async () => {
    setVisible(false);
    await markRated();
    await requestReview();
  };

  const onFeedback = () => {
    setVisible(false);
    setFeedback(true);
  };

  const onLater = () => setVisible(false);

  const onNever = async () => {
    setVisible(false);
    await turnOffNudges();
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onLater}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#00000088",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: tokens.cardBg,
              borderRadius: 20,
              padding: 22,
              gap: 8,
            }}
          >
            <Text
              style={{
                fontSize: 19,
                fontWeight: "700",
                color: tokens.text,
                textAlign: "center",
              }}
            >
              Enjoying Ripple?
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: tokens.textSec,
                textAlign: "center",
                lineHeight: 20,
              }}
            >
              We love hearing from people. A rating helps others find Ripple —
              or tell us what would make it better.
            </Text>

            <Pressable
              onPress={onRate}
              style={{
                backgroundColor: tokens.primary,
                borderRadius: 14,
                paddingVertical: 13,
                marginTop: 10,
              }}
            >
              <Text
                style={{
                  color: "#ffffff",
                  fontWeight: "700",
                  textAlign: "center",
                  fontSize: 15,
                }}
              >
                Rate Ripple
              </Text>
            </Pressable>

            <Pressable
              onPress={onFeedback}
              style={{
                borderRadius: 14,
                paddingVertical: 13,
                borderWidth: 1,
                borderColor: tokens.line ?? "#8884",
              }}
            >
              <Text
                style={{
                  color: tokens.text,
                  fontWeight: "600",
                  textAlign: "center",
                  fontSize: 15,
                }}
              >
                Leave feedback
              </Text>
            </Pressable>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginTop: 6,
              }}
            >
              <Pressable onPress={onLater} hitSlop={10}>
                <Text style={{ color: tokens.textSec, fontSize: 13 }}>
                  Maybe later
                </Text>
              </Pressable>
              <Pressable onPress={onNever} hitSlop={10}>
                <Text style={{ color: tokens.textSec, fontSize: 13 }}>
                  Don't ask again
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <FeedbackModal visible={feedback} onClose={() => setFeedback(false)} />
    </>
  );
}
