import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import { Dimensions, Pressable, View } from "react-native";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

/**
 * Mobile counterpart to apps/web/src/components/focus-card-stack.tsx.
 * Same API (FocusCard + dismissible resting card). Swipe the top
 * card horizontally > 80px to dismiss; under threshold snaps back.
 * Non-top cards render with pointerEvents="none" via Pressable
 * disable + GestureDetector scoped to the top card only.
 *
 * Animation: react-native-reanimated shared values for translateX +
 * a spring-free withTiming for the fly-away. Kept deliberately
 * simple in Run 1 — Run 2 may add a nicer spring + rotation.
 */

export type FocusCard = {
  id: string;
  type: "unlock" | "milestone" | "resting";
  dismissible: boolean;
  render: () => React.ReactNode;
};

const MAX_VISIBLE = 3;
const SWIPE_THRESHOLD = 80;
const LAYER_OFFSETS = [
  { y: 0, scale: 1, opacity: 1, rotate: 0 },
  { y: 10, scale: 0.96, opacity: 0.85, rotate: -1.5 },
  { y: 20, scale: 0.92, opacity: 0.7, rotate: 1.5 },
];

export function FocusCardStack({
  cards,
  onDismiss,
}: {
  cards: FocusCard[];
  onDismiss?: (card: FocusCard) => void;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = useMemo(
    () => cards.filter((c) => !dismissed.has(c.id)).slice(0, MAX_VISIBLE),
    [cards, dismissed]
  );

  const top = visible[0];

  const markDismissed = useCallback(
    (card: FocusCard) => {
      setDismissed((prev) => {
        if (prev.has(card.id)) return prev;
        const next = new Set(prev);
        next.add(card.id);
        return next;
      });
      onDismiss?.(card);
    },
    [onDismiss]
  );

  if (visible.length === 0) return null;

  // Resting-only: no fan, no gesture.
  if (visible.length === 1 && top && !top.dismissible) {
    return (
      <View className="w-full">
        <StaticCard card={top} />
      </View>
    );
  }

  return (
    <View className="w-full">
      {visible
        .slice(0)
        .reverse()
        .map((card, iFromBack) => {
          const layerIndex = visible.length - 1 - iFromBack;
          const isTop = layerIndex === 0;
          const layer =
            LAYER_OFFSETS[Math.min(layerIndex, LAYER_OFFSETS.length - 1)];

          return (
            <Layer
              key={card.id}
              card={card}
              layer={layer}
              isTop={isTop}
              zIndex={10 - layerIndex}
              onSwipeAway={() => markDismissed(card)}
            />
          );
        })}
    </View>
  );
}

function Layer({
  card,
  layer,
  isTop,
  zIndex,
  onSwipeAway,
}: {
  card: FocusCard;
  layer: (typeof LAYER_OFFSETS)[number];
  isTop: boolean;
  zIndex: number;
  onSwipeAway: () => void;
}) {
  const translateX = useSharedValue(0);
  const flyingAway = useSharedValue(0); // 0 = on-stack, 1 = flown

  const swipe = Gesture.Pan()
    .enabled(isTop && card.dismissible)
    .onChange((e) => {
      translateX.value = e.translationX;
    })
    .onEnd(() => {
      const x = translateX.value;
      if (Math.abs(x) >= SWIPE_THRESHOLD) {
        const dir = x > 0 ? 1 : -1;
        const off = dir * Dimensions.get("window").width;
        translateX.value = withTiming(off, { duration: 220 }, (finished) => {
          if (finished) {
            flyingAway.value = 1;
            runOnJS(onSwipeAway)();
          }
        });
      } else {
        translateX.value = withTiming(0, { duration: 180 });
      }
    });

  const style = useAnimatedStyle(() => {
    if (flyingAway.value === 1) {
      return { opacity: 0 };
    }
    return {
      transform: [
        { translateX: isTop ? translateX.value : 0 },
        { translateY: layer.y },
        { scale: layer.scale },
        { rotate: `${layer.rotate}deg` },
      ],
      opacity: layer.opacity,
    };
  });

  // Non-top layers are NOT pannable and not pressable. Absolute-position
  // behind the top layer; top is relative so it contributes intrinsic
  // height to the container.
  const positional = isTop
    ? { position: "relative" as const }
    : { position: "absolute" as const, top: 0, left: 0, right: 0 };

  const content = (
    <Animated.View
      style={[{ zIndex }, positional, style]}
      pointerEvents={isTop ? "auto" : "none"}
    >
      <StaticCard
        card={card}
        onClose={
          isTop && card.dismissible
            ? () => {
                const dir = 1;
                const off = dir * Dimensions.get("window").width;
                cancelAnimation(translateX);
                translateX.value = withTiming(
                  off,
                  { duration: 220 },
                  (finished) => {
                    if (finished) {
                      flyingAway.value = 1;
                      runOnJS(onSwipeAway)();
                    }
                  }
                );
              }
            : undefined
        }
      />
    </Animated.View>
  );

  if (!isTop || !card.dismissible) return content;

  return <GestureDetector gesture={swipe}>{content}</GestureDetector>;
}

function StaticCard({
  card,
  onClose,
}: {
  card: FocusCard;
  onClose?: () => void;
}) {
  return (
    <View className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-5">
      {onClose && (
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityLabel="Dismiss"
          style={{
            position: "absolute",
            right: 10,
            top: 10,
            height: 28,
            width: 28,
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1,
          }}
        >
          <Ionicons name="close" size={16} color="#A1A1AA" />
        </Pressable>
      )}
      <View>{card.render()}</View>
    </View>
  );
}
