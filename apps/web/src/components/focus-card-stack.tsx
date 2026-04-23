"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Fanned card stack — shows up to 3 cards at a time, the top one
 * interactive, the rest peeking behind with a subtle fan.
 *
 * Consumer passes an ordered queue (index 0 = top, interactive).
 * Dismissing the top card (swipe or X button) advances the stack:
 * the next card scales up to 1.0 opacity/no-rotation, the one behind
 * it takes its place, and if the queue has 4+ items a new card
 * slides in at the back.
 *
 * Resting cards (type: "resting", dismissible: false) can't be
 * dismissed — the swipe gesture is disabled and the X button hidden.
 * When only a resting card remains, it renders flat, centered, no
 * peek/rotation/offset — this is the resting state.
 *
 * Web implementation: CSS transforms + pointer events. No animation
 * library dep. Swipe = pointer drag > 80px horizontal threshold.
 */

export type FocusCard = {
  id: string;
  /** Semantic category. Drives later behavior (celebration treatment
   *  on "milestone", etc.); for Run 1 the component treats them the
   *  same aside from `resting`. */
  type: "unlock" | "milestone" | "resting";
  /** Resting cards pin false. Unlock / milestone typically true. */
  dismissible: boolean;
  render: () => React.ReactNode;
};

const MAX_VISIBLE = 3;
const SWIPE_THRESHOLD_PX = 80;
// Per-layer peek offsets. Index 0 = top (no offset). Alternating
// rotation gives the stack a natural hand-dealt fan.
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
  /** Fires after the dismiss animation completes. Parent is expected
   *  to update the queue to remove the dismissed card; if it doesn't,
   *  the component restores the card (noop). Run 1 doesn't persist
   *  dismissals — each page load re-fetches the queue. */
  onDismiss?: (card: FocusCard) => void;
}) {
  // Local dismissal tracking so we can animate out smoothly before
  // the parent removes the card from props. If the parent removes
  // first, we also respect that.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragX, setDragX] = useState(0);
  const [flyAway, setFlyAway] = useState<{ id: string; dir: 1 | -1 } | null>(
    null
  );
  const startXRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);

  const visible = useMemo(
    () => cards.filter((c) => !dismissed.has(c.id)).slice(0, MAX_VISIBLE),
    [cards, dismissed]
  );

  const top = visible[0];
  const topIsResting = top && !top.dismissible;

  // When parent removes a card we dismissed, clear it from local set
  // so dismissed doesn't grow unbounded across prop updates.
  useEffect(() => {
    const ids = new Set(cards.map((c) => c.id));
    setDismissed((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (ids.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [cards]);

  const dismiss = useCallback(
    (card: FocusCard, dir: 1 | -1) => {
      if (!card.dismissible) return;
      setFlyAway({ id: card.id, dir });
      // Let the fly-away transform run before we hide the card.
      window.setTimeout(() => {
        setDismissed((prev) => {
          if (prev.has(card.id)) return prev;
          const next = new Set(prev);
          next.add(card.id);
          return next;
        });
        setFlyAway(null);
        setDragX(0);
        setDraggingId(null);
        onDismiss?.(card);
      }, 220);
    },
    [onDismiss]
  );

  const onPointerDown = (e: React.PointerEvent, card: FocusCard) => {
    if (!card.dismissible || flyAway) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointerIdRef.current = e.pointerId;
    startXRef.current = e.clientX;
    setDraggingId(card.id);
    setDragX(0);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (draggingId == null || e.pointerId !== pointerIdRef.current) return;
    setDragX(e.clientX - startXRef.current);
  };
  const onPointerUp = (e: React.PointerEvent, card: FocusCard) => {
    if (e.pointerId !== pointerIdRef.current) return;
    pointerIdRef.current = null;
    const settled = dragX;
    setDragX(0);
    setDraggingId(null);
    if (Math.abs(settled) >= SWIPE_THRESHOLD_PX) {
      dismiss(card, settled > 0 ? 1 : -1);
    }
  };

  if (visible.length === 0) return null;

  // Resting-only state: render flat, centered, no fan.
  if (visible.length === 1 && topIsResting) {
    return (
      <div className="relative mx-auto w-full max-w-md">
        <Card card={visible[0]} transform="" opacity={1} zIndex={10} />
      </div>
    );
  }

  return (
    <div className="relative mx-auto w-full max-w-md" aria-live="polite">
      {/* Reserve vertical space equal to the layout height of the top
          card + the deepest peek offset, so sibling content below
          doesn't jump as cards fly in and out. Measured via the top
          card's natural height via a layout ghost sibling. */}
      {visible
        .slice(0)
        .reverse()
        .map((card, iFromBack) => {
          const layerIndex = visible.length - 1 - iFromBack; // 0 = top
          const layer =
            LAYER_OFFSETS[Math.min(layerIndex, LAYER_OFFSETS.length - 1)];
          const isTop = layerIndex === 0;
          const dragging = draggingId === card.id;
          const flying = flyAway?.id === card.id;

          let transform = `translate3d(0, ${layer.y}px, 0) scale(${layer.scale}) rotate(${layer.rotate}deg)`;
          let transition = "transform 220ms ease-out, opacity 220ms ease-out";

          if (dragging && isTop) {
            const rot = (dragX / 20).toFixed(2);
            transform = `translate3d(${dragX}px, 0, 0) rotate(${rot}deg)`;
            transition = "none";
          } else if (flying && isTop) {
            const dir = flyAway.dir;
            transform = `translate3d(${dir * 500}px, -40px, 0) rotate(${dir * 18}deg)`;
            transition = "transform 220ms ease-out, opacity 220ms ease-out";
          }

          const opacity = flying ? 0 : layer.opacity;

          return (
            <div
              key={card.id}
              // Stack via absolute positioning — layers share bounds,
              // except the top one is relative so it contributes to
              // the container's intrinsic height.
              className={isTop ? "relative" : "absolute inset-0"}
              style={{
                transform,
                transition,
                opacity,
                zIndex: 10 - layerIndex,
                // Non-top layers should eat no pointer events even
                // though they render interactive children.
                pointerEvents: isTop ? "auto" : "none",
                touchAction: "pan-y",
              }}
              onPointerDown={isTop ? (e) => onPointerDown(e, card) : undefined}
              onPointerMove={isTop ? onPointerMove : undefined}
              onPointerUp={isTop ? (e) => onPointerUp(e, card) : undefined}
              onPointerCancel={
                isTop
                  ? () => {
                      pointerIdRef.current = null;
                      setDragX(0);
                      setDraggingId(null);
                    }
                  : undefined
              }
            >
              <Card
                card={card}
                onClose={
                  isTop && card.dismissible ? () => dismiss(card, 1) : undefined
                }
              />
            </div>
          );
        })}
    </div>
  );
}

function Card({
  card,
  transform,
  opacity,
  zIndex,
  onClose,
}: {
  card: FocusCard;
  transform?: string;
  opacity?: number;
  zIndex?: number;
  onClose?: () => void;
}) {
  return (
    <div
      className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_2px_6px_rgba(0,0,0,0.06),0_10px_24px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-[#1E1E2E] dark:shadow-none dark:ring-1 dark:ring-white/5"
      style={transform || opacity != null || zIndex != null ? { transform, opacity, zIndex } : undefined}
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="absolute right-3 top-3 h-7 w-7 rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200 flex items-center justify-center"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      )}
      {card.render()}
    </div>
  );
}
