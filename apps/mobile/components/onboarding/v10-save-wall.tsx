import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { router } from "expo-router";

import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { makeAcuityTokens } from "@/lib/theme/tokens";
import { isOnboardingV10Enabled } from "@/lib/feature-flags";
import { SAVE_WALL_COPY, saveWallFor } from "@/lib/onboarding-v10/guest-mode";
import {
  bumpSaveWallHits,
  getSaveWallHits,
  isV10Guest,
} from "@/lib/onboarding-v10/state";
import { trackV10 } from "@/lib/onboarding-v10/analytics";

/**
 * Guest save wall (spec §9).
 *
 * A guest tapping the mic gets an explanation instead of the recorder: soft
 * and dismissible the first time, hard after that. See
 * lib/onboarding-v10/guest-mode.ts for why the escalation lands where it
 * does.
 *
 * ── Why a provider rather than a prop on each mic button ─────────────
 * There are three mic entry points (Home's CTA, the tab-bar centre
 * long-press, and the recorder route itself) and they live in unrelated
 * trees. Threading a callback through all three would leave the newest one
 * unprotected the moment someone adds a fourth. A context means the check
 * happens in one place and any caller can ask.
 */

interface SaveWallApi {
  /** True when the caller should NOT proceed — the wall has been shown. */
  interceptRecord: () => boolean;
  isGuest: boolean;
}

const SaveWallContext = createContext<SaveWallApi>({
  interceptRecord: () => false,
  isGuest: false,
});

export function useSaveWall(): SaveWallApi {
  return useContext(SaveWallContext);
}

export function SaveWallProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { palette } = useTheme();
  const tokens = useMemo(
    () => makeAcuityTokens({ dark: true, accent: palette }),
    [palette]
  );

  const [isGuest, setIsGuest] = useState(false);
  const [hits, setHits] = useState(0);
  const [open, setOpen] = useState(false);

  // A signed-in user is never a guest, whatever the local flag says — the
  // account is the authority. This also self-heals a stale flag left by a
  // setV10Guest(false) write that failed.
  const guestActive = isOnboardingV10Enabled() && isGuest && !user;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!isOnboardingV10Enabled() || user) {
        if (!cancelled) setIsGuest(false);
        return;
      }
      const [g, h] = await Promise.all([isV10Guest(), getSaveWallHits()]);
      if (cancelled) return;
      setIsGuest(g);
      setHits(h);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const interceptRecord = useCallback(() => {
    if (!guestActive) return false;
    void (async () => {
      const next = await bumpSaveWallHits();
      setHits(next - 1); // hits BEFORE this one drives which wall shows
      trackV10("v10_save_wall_shown", { attempt: next });
    })();
    setOpen(true);
    return true;
  }, [guestActive]);

  const kind = saveWallFor(hits);
  const copy = SAVE_WALL_COPY[kind];

  const onSave = useCallback(() => {
    setOpen(false);
    trackV10("v10_save_wall_accepted", { kind });
    // Back to Screen 7, which owns every auth path and the claim.
    router.push("/onboarding-new/account");
  }, [kind]);

  const onDismiss = useCallback(() => {
    if (kind === "hard") return; // no escape by design
    setOpen(false);
    trackV10("v10_save_wall_dismissed", { kind });
  }, [kind]);

  const api = useMemo(
    () => ({ interceptRecord, isGuest: guestActive }),
    [interceptRecord, guestActive]
  );

  return (
    <SaveWallContext.Provider value={api}>
      {children}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        // Android hardware back must not bypass a hard wall.
        onRequestClose={onDismiss}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            paddingHorizontal: 28,
          }}
        >
          <View
            style={{
              backgroundColor: tokens.bgInset,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: tokens.line,
              padding: 22,
            }}
          >
            <Text
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 20,
                color: tokens.text,
                marginBottom: 8,
              }}
            >
              {copy.title}
            </Text>
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 15,
                lineHeight: 22,
                color: tokens.textSec,
                marginBottom: 20,
              }}
            >
              {copy.body}
            </Text>

            <Pressable
              onPress={onSave}
              accessibilityRole="button"
              style={({ pressed }) => ({
                backgroundColor: tokens.primary,
                borderRadius: 999,
                paddingVertical: 16,
                alignItems: "center",
                transform: [{ scale: pressed ? 0.99 : 1 }],
              })}
            >
              <Text
                style={{
                  fontFamily: tokens.fontDisplay,
                  fontSize: 16,
                  color: "#ffffff",
                }}
              >
                {copy.primary}
              </Text>
            </Pressable>

            {copy.secondary ? (
              <Pressable
                onPress={onDismiss}
                accessibilityRole="button"
                style={{ paddingVertical: 14, alignItems: "center" }}
              >
                <Text
                  style={{
                    fontFamily: tokens.fontSans,
                    fontSize: 14,
                    color: tokens.textTer,
                  }}
                >
                  {copy.secondary}
                </Text>
              </Pressable>
            ) : (
              <View style={{ height: 8 }} />
            )}
          </View>
        </View>
      </Modal>
    </SaveWallContext.Provider>
  );
}
