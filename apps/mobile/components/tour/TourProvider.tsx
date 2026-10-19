import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import {
  SpotlightTourProvider,
  type TourStep,
  type TourState,
} from "react-native-spotlight-tour";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { requestAchievementCheck } from "@/lib/achievement-bus";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import { trackOnboardingEvent } from "@/lib/onboarding-events";
import { markExplored } from "@/lib/whats-new-state";
import { TourTooltip } from "./TourTooltip";
import { WelcomeTourCard } from "./WelcomeTourCard";
import { WhatsNewTourCard } from "./WhatsNewTourCard";
import type { WhatsNewTourRequest } from "./whats-new-tour";
import { welcomeTourCards, type WelcomeTourRequest } from "./welcome-tour";
import { WELCOME_CORAL } from "@/lib/welcome/look";
import {
  TOUR_STEP_CONTENT,
  TOUR_STEP_INDEX,
  TOUR_TOTAL_STEPS,
  WHATS_NEW_STEP_INDEX,
  WHATS_NEW_STEP_PATHS,
} from "./steps";

// Matches use-tour-trigger's ASYNC_STORAGE_KEY — written here on stop so
// a network failure can't re-fire the tour locally on the next launch.
const TOUR_COMPLETED_MARKER_KEY = "acuity.tour.completed";

// The home route the tour opens on (mic + dashboard steps live here).
const HOME_PATH = "/(tabs)" as const;

// Each step now lives on its OWN screen and spotlights a real element
// label. The per-step `before` navigates to this route so the user sees
// the real page; the spotlight then anchors on that section's BOTTOM TAB
// BAR item (always mounted + measurable), teaching where the tab lives.
// Settings has no bottom tab, so step 7 returns HOME and spotlights the
// gear in the home header.
// Indexed by TOUR_STEP_INDEX order: mic, dashboard, entries, tasks,
// insights, goals, settings.
const TOUR_STEP_PATHS: string[] = [
  HOME_PATH, // mic
  HOME_PATH, // dashboard
  "/(tabs)/entries",
  "/(tabs)/tasks",
  "/(tabs)/insights",
  "/(tabs)/goals",
  HOME_PATH, // settings → home (spotlight the header gear, not a tab)
];

// How long to wait after switching tabs before the spotlight measures the
// target — lets the tab become visible + lay out. Tune in sim if a cutout
// lands before its screen settles.
const NAV_SETTLE_MS = 450;

/**
 * Wraps the app's navigator with react-native-spotlight-tour, replacing
 * react-native-copilot (which couldn't measure/render under the New
 * Architecture — 244 start() calls, 0 tooltip renders across 99 users;
 * see commit history). spotlight-tour measures via `measureInWindow`,
 * which works under Fabric.
 *
 * Mounted in app/_layout.tsx above the Stack (inside AuthProvider so
 * onStop can refresh()): the tour spans tabs (mic + tab labels) and the
 * Home screen (IdentityHero), so the provider must sit above all of them.
 *
 * Steps are defined here as an array (spotlight's model); each target
 * attaches by index via <AttachStep index={TOUR_STEP_INDEX.x}>. Analytics
 * + tourCompletedAt persistence — which copilot drove via copilotEvents —
 * now live on the per-step `before` (tour_step_viewed) and `onStop`
 * (tour_completed/skipped + POST /api/user/tour-complete) below.
 */
/**
 * Welcome mode (2026-10-12): the funnel welcome flow's last step runs the
 * tour through THIS provider — same engine, same AttachStep targets — but
 * with its own stops (welcome-tour.ts), the coral WelcomeTourCard and a
 * progress bar continuing from the welcome screens. A child calls
 * prepareWelcomeTour(req) and then spotlight's start(); welcome card 0 is
 * step 0 (the Home button), so start() lands on it.
 */
/**
 * What's New mode (1.9.1): same engine again, stops from
 * whats-new-tour.ts. A caller runs prepareWhatsNewTour(req) then
 * spotlight's goTo(req.cards[0].target). Targets 7+ (WHATS_NEW_STEP_INDEX)
 * exist only for this mode; the first-login tour stops at step 6.
 */
type TourModeApi = {
  prepareWelcomeTour: (req: WelcomeTourRequest) => void;
  prepareWhatsNewTour: (req: WhatsNewTourRequest) => void;
};
const TourModeContext = createContext<TourModeApi>({
  prepareWelcomeTour: () => {},
  prepareWhatsNewTour: () => {},
});

// Path for each What's New step index (7+).
const WHATS_NEW_PATH_BY_INDEX: Record<number, string> = Object.fromEntries(
  (Object.keys(WHATS_NEW_STEP_INDEX) as (keyof typeof WHATS_NEW_STEP_INDEX)[]).map(
    (k) => [WHATS_NEW_STEP_INDEX[k], WHATS_NEW_STEP_PATHS[k]]
  )
);
// Tooltip below the target for these (targets sit high on their screens).
const WHATS_NEW_BELOW = new Set<number>([
  WHATS_NEW_STEP_INDEX.today,
  WHATS_NEW_STEP_INDEX.swipe,
  WHATS_NEW_STEP_INDEX.actionButton,
  WHATS_NEW_STEP_INDEX.notifications,
]);
const LAST_CLASSIC = TOUR_TOTAL_STEPS - 1;
export function useTourMode(): TourModeApi {
  return useContext(TourModeContext);
}

export function TourProvider({ children }: { children: ReactNode }) {
  const { tokens } = useTheme();
  const { refresh } = useAuth();
  const router = useRouter();
  // The route the tour currently has on-screen. Seeded to home (the tour
  // opens there); used to skip a redundant navigate+settle when the next
  // step is on the same screen (mic → dashboard are both home).
  const lastPathRef = useRef<string>(HOME_PATH);
  // Welcome mode. Refs (read at render time) so the first step renders in
  // the right mode even though start() runs in the same tick as prepare;
  // the state mirror only re-renders the provider's own props.
  const welcomeReqRef = useRef<WelcomeTourRequest | null>(null);
  const welcomeCardRef = useRef(0);
  const [welcomeActive, setWelcomeActive] = useState(false);
  const prepareWelcomeTour = useCallback((req: WelcomeTourRequest) => {
    welcomeReqRef.current = req;
    welcomeCardRef.current = 0;
    setWelcomeActive(true);
  }, []);
  // What's New mode (refs for the same reason as welcome mode).
  const whatsNewReqRef = useRef<WhatsNewTourRequest | null>(null);
  const whatsNewCardRef = useRef(0);
  const whatsNewBackToListRef = useRef(false);
  const [whatsNewActive, setWhatsNewActive] = useState(false);
  const prepareWhatsNewTour = useCallback((req: WhatsNewTourRequest) => {
    whatsNewReqRef.current = req;
    whatsNewCardRef.current = 0;
    whatsNewBackToListRef.current = false;
    // Started from the What's New page (a pushed screen) or a sheet — we
    // don't know what's on screen, so the first stop always navigates.
    lastPathRef.current = "";
    setWhatsNewActive(true);
  }, []);
  const modeApi = useMemo(
    () => ({ prepareWelcomeTour, prepareWhatsNewTour }),
    [prepareWelcomeTour, prepareWhatsNewTour]
  );

  // Shared by every step: navigate to the step's screen (skip if already
  // there) and give it time to lay out before spotlight measures.
  const goToPath = useCallback(
    async (path: string, settleAnyway: boolean) => {
      if (path !== lastPathRef.current) {
        lastPathRef.current = path;
        router.navigate(path as never);
        await new Promise((r) => setTimeout(r, NAV_SETTLE_MS));
      } else if (settleAnyway) {
        await new Promise((r) => setTimeout(r, NAV_SETTLE_MS));
      }
    },
    [router]
  );

  const renderWhatsNew = useCallback(
    (props: { goTo: (i: number) => void; stop: () => void }) => {
      const req = whatsNewReqRef.current;
      if (!req) return <></>;
      const at = Math.min(whatsNewCardRef.current, req.cards.length - 1);
      const card = req.cards[at];
      return (
        <WhatsNewTourCard
          card={card}
          at={at}
          count={req.cards.length}
          single={req.single}
          onNext={() => {
            if (req.single || at === req.cards.length - 1) {
              props.stop();
              return;
            }
            whatsNewCardRef.current = at + 1;
            props.goTo(req.cards[at + 1].target);
          }}
          onBack={() => {
            if (at === 0) return;
            whatsNewCardRef.current = at - 1;
            props.goTo(req.cards[at - 1].target);
          }}
          onSkip={() => props.stop()}
          onBackToList={() => {
            whatsNewBackToListRef.current = true;
            props.stop();
          }}
        />
      );
    },
    []
  );

  // Marks the current What's New card's item explored as its stop opens.
  const noteWhatsNewStop = useCallback(() => {
    const req = whatsNewReqRef.current;
    if (!req) return;
    const card = req.cards[Math.min(whatsNewCardRef.current, req.cards.length - 1)];
    if (card?.itemId) markExplored(card.itemId);
  }, []);

  const steps = useMemo<TourStep[]>(
    () =>
      TOUR_STEP_CONTENT.map((content, i): TourStep => ({
        // mic is a round button → circle spotlight; everything else is a
        // rectangular slot/card.
        shape:
          i === TOUR_STEP_INDEX.mic
            ? { type: "circle", padding: 10 }
            : { type: "rectangle", padding: 8 },
        // Targets in the BOTTOM tab bar (mic + the four tab items) get the
        // tooltip ABOVE ("top"); targets in the home header (dashboard
        // hero, settings gear) get it BELOW ("bottom"). Keeps the tooltip
        // fully on-screen (build-68: step 7 was clipped off the bottom).
        placement:
          i === TOUR_STEP_INDEX.dashboard || i === TOUR_STEP_INDEX.settings
            ? "bottom"
            : "top",
        // Keep the card off the screen edges (it sat flush against the
        // right edge on the Entries stop in build 159).
        shift: { padding: 16 },
        // Navigate to this step's screen before it renders, so the spotlight
        // measures a visible target. Awaited by spotlight, so the step waits
        // for the tab to settle. Same-screen transitions skip the delay.
        before: async () => {
          if (whatsNewReqRef.current) {
            noteWhatsNewStop();
            await goToPath(TOUR_STEP_PATHS[i] ?? HOME_PATH, i === TOUR_STEP_INDEX.mic);
            return;
          }
          if (welcomeReqRef.current) {
            void trackOnboardingEvent("v10_welcome_tour_step", {
              value: String(welcomeCardRef.current + 1),
            });
          } else {
            void trackOnboardingEvent("tour_step_viewed", {
              value: String(i + 1),
            });
          }
          const path = TOUR_STEP_PATHS[i] ?? HOME_PATH;
          if (path !== lastPathRef.current) {
            lastPathRef.current = path;
            router.navigate(path as never);
            await new Promise((r) => setTimeout(r, NAV_SETTLE_MS));
          } else if (i === TOUR_STEP_INDEX.mic) {
            // Step 0 (mic) opens on the same screen the tour started on, so
            // the branch above skips the settle — but the raised,
            // absolutely-positioned mic wrapper needs a beat to finish
            // layout before measureInWindow, or its cutout mis-measures and
            // lands mid-screen (vc24 bug: spotlight over the goal card
            // instead of the mic FAB). Give it the same settle steps 1–6 get.
            await new Promise((r) => setTimeout(r, NAV_SETTLE_MS));
          }
        },
        render: (props) => {
          if (whatsNewReqRef.current) return renderWhatsNew(props);
          const req = welcomeReqRef.current;
          if (req) {
            const cards = welcomeTourCards(req);
            const at = Math.min(welcomeCardRef.current, cards.length - 1);
            const card = cards[at];
            const isLast = at === cards.length - 1;
            return (
              <WelcomeTourCard
                label={card.label}
                title={card.title}
                body={card.body}
                cta={card.cta}
                stop={at}
                stops={cards.length - 1}
                isFirst={at === 0}
                isLast={isLast}
                onNext={() => {
                  if (isLast) {
                    props.stop();
                    return;
                  }
                  welcomeCardRef.current = at + 1;
                  props.goTo(cards[at + 1].target);
                }}
                onBack={() => {
                  if (at === 0) return;
                  welcomeCardRef.current = at - 1;
                  props.goTo(cards[at - 1].target);
                }}
                onSkip={() => props.stop()}
              />
            );
          }
          // The steps array now also holds What's New targets (7+), so
          // spotlight's own isLast/next would walk past Settings. The
          // first-login tour ends at its last step.
          return (
            <TourTooltip
              {...props}
              isLast={i === LAST_CLASSIC}
              next={i === LAST_CLASSIC ? props.stop : props.next}
              content={content}
              total={TOUR_TOTAL_STEPS}
            />
          );
        },
      })).concat(
        (Object.values(WHATS_NEW_STEP_INDEX) as number[]).map(
          (idx): TourStep => ({
            shape: { type: "rectangle", padding: 8 },
            placement: WHATS_NEW_BELOW.has(idx) ? "bottom" : "top",
            flip: true,
            shift: { padding: 16 },
            before: async () => {
              noteWhatsNewStop();
              await goToPath(WHATS_NEW_PATH_BY_INDEX[idx] ?? HOME_PATH, false);
            },
            render: (props) => renderWhatsNew(props),
          })
        )
      ),
    [router, goToPath, noteWhatsNewStop, renderWhatsNew]
  );

  const handleStop = useCallback(
    (state: TourState) => {
      // What's New mode: no first-login bookkeeping. Back to the list if
      // they asked for it, otherwise Home.
      if (whatsNewReqRef.current) {
        const backToList = whatsNewBackToListRef.current;
        whatsNewReqRef.current = null;
        whatsNewCardRef.current = 0;
        whatsNewBackToListRef.current = false;
        setWhatsNewActive(false);
        router.navigate(HOME_PATH as never);
        lastPathRef.current = HOME_PATH;
        if (backToList) {
          setTimeout(() => router.push("/whats-new" as never), NAV_SETTLE_MS);
        }
        return;
      }
      // Reaching the last step = completion; stopping earlier = skip.
      // Welcome mode walks its own sequence, so "last" is its last card.
      const welcomeReq = welcomeReqRef.current;
      const finished = welcomeReq
        ? welcomeCardRef.current >= welcomeTourCards(welcomeReq).length - 1
        : state.index >= LAST_CLASSIC;
      if (welcomeReq) {
        void trackOnboardingEvent(finished ? "v10_welcome_tour_completed" : "v10_welcome_tour_skipped", {
          value: String(welcomeCardRef.current + 1),
        });
        welcomeReqRef.current = null;
        welcomeCardRef.current = 0;
        setWelcomeActive(false);
      }
      // The tour now walks across tabs (ending on /profile). Return the
      // user home when it ends (finish or skip), and reset the path ref
      // so a later replay starts cleanly from home.
      router.navigate(HOME_PATH as never);
      lastPathRef.current = HOME_PATH;
      void trackOnboardingEvent(
        finished ? "tour_completed" : "tour_skipped",
        { value: String(state.index + 1) }
      );
      // Local marker first so a network failure doesn't re-fire the tour.
      AsyncStorage.setItem(
        TOUR_COMPLETED_MARKER_KEY,
        new Date().toISOString()
      ).catch(() => {});
      // Server persistence — fire-and-forget; refresh() pulls the new
      // tourCompletedAt afterward. `completed` gates the guided_start
      // achievement server-side: only a genuine finish (last step)
      // awards it; a skip stamps tourCompletedAt without the achievement.
      void api
        .post("/api/user/tour-complete", { completed: finished })
        .catch(() => {})
        .finally(() => {
          void refresh();
          // On genuine completion the server granted guided_start
          // (shownToUser=false). The celebration queue only re-polls on
          // mount/foreground/bus-ping — none of which fire here (user is
          // already on home, app foreground) — so ping the bus to make
          // the celebration modal appear. (Was: achievement granted but
          // modal never showed.)
          if (finished) requestAchievementCheck();
        });
    },
    [refresh, router]
  );

  return (
    <TourModeContext.Provider value={modeApi}>
    <SpotlightTourProvider
      steps={steps}
      overlayColor="rgb(8, 8, 16)"
      // Welcome mode barely dims: the point of each stop is to SHOW that
      // page (Jimmy, 2026-10-12), so it must read clearly behind the card.
      overlayOpacity={welcomeActive ? 0.12 : whatsNewActive ? 0.6 : 0.78}
      motion="fade"
      // Tapping the overlay (incl. the highlighted target area) advances
      // to the next step rather than doing nothing — so a tap on the
      // spotlit element feels responsive. Explicit Skip (in the tooltip)
      // is the exit. On the last step, "continue" stops the tour.
      // Welcome mode walks a custom sequence (goTo), so a backdrop tap must
      // not advance spotlight's own index.
      // What's New mode also walks its own sequence: backdrop does nothing.
      // First-login: continue, but stop at its last step (What's New
      // targets follow it in the array).
      onBackdropPress={
        welcomeActive || whatsNewActive
          ? undefined
          : (tour) => {
              if (tour.current === undefined) return;
              if (tour.current >= LAST_CLASSIC) tour.stop();
              else tour.next();
            }
      }
      arrow={{ color: welcomeActive ? WELCOME_CORAL.bottom : tokens.cardBg }}
      shape={{ type: "rectangle", padding: 8 }}
      onStop={handleStop}
    >
      {children}
    </SpotlightTourProvider>
    </TourModeContext.Provider>
  );
}
