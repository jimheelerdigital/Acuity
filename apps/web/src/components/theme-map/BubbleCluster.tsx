"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Bubble cluster — web parity for the mobile BubbleCluster. Each theme
 * is an SVG circle whose area scales with mention count; bubbles are
 * packed by an inline relaxation algorithm that iteratively pushes
 * overlapping pairs apart while gently pulling each toward the center.
 *
 * Why inline relaxation instead of d3-force:
 *   - Avoids a 15KB gzipped dep for ~40 lines of math that's
 *     deterministic and fast enough for ≤12 bubbles.
 *   - Convergence is stable for this bubble count — no live ticker,
 *     no frame-by-frame flicker; just a synchronous pass inside
 *     useMemo.
 *
 * Responsive sizing:
 *   - Container ResizeObserver tracks width.
 *   - Height caps at 600px on wide viewports per spec; scales with
 *     viewport on narrow.
 *   - Circles fully repack on width change.
 *
 * Animation: each bubble fades + scales in with a staggered CSS delay
 * keyed off the bubble's index. No reanimated equivalent on web;
 * plain CSS keyframes are lightest and play well with React's render
 * cycle.
 */

type SentimentTone = "positive" | "challenging" | "neutral";

export type BubbleTheme = {
  id: string;
  name: string;
  mentionCount: number;
  tone: SentimentTone;
};

type PlacedNode = BubbleTheme & {
  x: number;
  y: number;
  r: number;
};

const MIN_RADIUS = 32;
const MAX_RADIUS = 72;
const PACKING_PADDING = 6;

const GRADIENT_CENTER: Record<SentimentTone, string> = {
  positive: "#6EE7B7",
  challenging: "#FCA5A5",
  neutral: "#C4B5FD",
};
const GRADIENT_EDGE: Record<SentimentTone, string> = {
  positive: "#047857",
  challenging: "#991B1B",
  neutral: "#4338CA",
};
const GLOW: Record<SentimentTone, string> = {
  positive: "rgba(52,211,153,0.35)",
  challenging: "rgba(248,113,113,0.35)",
  neutral: "rgba(124,58,237,0.35)",
};

export function BubbleCluster({
  themes,
  onTap,
  replayKey = 0,
}: {
  themes: BubbleTheme[];
  onTap?: (id: string) => void;
  replayKey?: number | string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  // Narrow viewport (<640px) matches the mobile layout. Wider viewports
  // let the visualization breathe up to 600px tall.
  const height = width >= 640 ? 520 : 360;

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = Math.round(e.contentRect.width);
        if (w > 0) setWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const placed = useMemo(() => {
    if (width === 0 || themes.length === 0) return [] as PlacedNode[];
    return pack(themes, width, height);
  }, [themes, width, height]);

  return (
    <div
      ref={ref}
      className="relative my-4 overflow-hidden rounded-3xl border p-4"
      style={{
        borderColor: "rgba(255,255,255,0.06)",
        background:
          "linear-gradient(135deg, rgba(30,27,75,0.35) 0%, rgba(23,23,42,0.15) 100%)",
        minHeight: height,
      }}
    >
      {placed.length > 0 && (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          style={{ display: "block", overflow: "visible" }}
        >
          <defs>
            {(["positive", "challenging", "neutral"] as const).map((t) => (
              <radialGradient
                key={t}
                id={`web-bubble-grad-${t}`}
                cx="35%"
                cy="35%"
                r="70%"
              >
                <stop
                  offset="0%"
                  stopColor={GRADIENT_CENTER[t]}
                  stopOpacity={0.95}
                />
                <stop
                  offset="100%"
                  stopColor={GRADIENT_EDGE[t]}
                  stopOpacity={0.85}
                />
              </radialGradient>
            ))}
          </defs>

          {placed.map((n, i) => (
            <g
              key={`${n.id}-${replayKey}`}
              style={{
                transformOrigin: `${n.x}px ${n.y}px`,
                animation: `bubble-enter 520ms cubic-bezier(0.22,1,0.36,1) ${i * 35}ms both`,
              }}
            >
              <circle cx={n.x} cy={n.y} r={n.r + 6} fill={GLOW[n.tone]} />
              <circle
                cx={n.x}
                cy={n.y}
                r={n.r}
                fill={`url(#web-bubble-grad-${n.tone})`}
                style={{ cursor: onTap ? "pointer" : "default" }}
                onClick={onTap ? () => onTap(n.id) : undefined}
              />
              <text
                x={n.x}
                y={n.y + 4}
                textAnchor="middle"
                fontSize={n.r >= 48 ? 13 : 11}
                fontWeight={600}
                fill={n.r >= 40 ? "#FFFFFF" : "rgba(228,228,231,0.85)"}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {n.r >= 40 ? sentenceCase(n.name) : ""}
              </text>
              {n.r < 40 && (
                <text
                  x={n.x}
                  y={n.y + n.r + 14}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={500}
                  fill="rgba(228,228,231,0.85)"
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {sentenceCase(n.name)}
                </text>
              )}
            </g>
          ))}
        </svg>
      )}

      <style>{`
        @keyframes bubble-enter {
          from { opacity: 0; transform: scale(0.4); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

function sentenceCase(s: string): string {
  if (!s) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Inline bubble packing — mirrors the d3-force collide + center behavior
 * the mobile BubbleCluster uses. For each iteration:
 *   1. Pull each node gently toward the center of the container.
 *   2. For every overlapping pair, push them apart equally along their
 *      separating axis by half the overlap amount.
 *   3. Clamp each node inside the container.
 *
 * 200 iterations converge reliably for ≤12 nodes in a 320-1200px wide
 * container. If you raise bubble count, bump iterations proportionally
 * — overlap resolution is O(n²) per iteration.
 */
function pack(
  themes: BubbleTheme[],
  width: number,
  height: number
): PlacedNode[] {
  const cx = width / 2;
  const cy = height / 2;

  const maxMentions = Math.max(...themes.map((t) => t.mentionCount), 1);
  const minMentions = Math.min(...themes.map((t) => t.mentionCount));
  const span = Math.max(1, maxMentions - minMentions);

  const nodes: PlacedNode[] = themes.map((t, i) => {
    const scaled =
      MIN_RADIUS +
      Math.sqrt((t.mentionCount - minMentions) / span) *
        (MAX_RADIUS - MIN_RADIUS);
    return {
      ...t,
      r: Math.round(scaled),
      x: cx + Math.cos((i / themes.length) * Math.PI * 2) * 80,
      y: cy + Math.sin((i / themes.length) * Math.PI * 2) * 80,
    };
  });

  const ITERATIONS = 200;
  const CENTER_STRENGTH = 0.04;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Pull toward center.
    for (const n of nodes) {
      n.x += (cx - n.x) * CENTER_STRENGTH;
      n.y += (cy - n.y) * CENTER_STRENGTH;
    }
    // Resolve collisions.
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const min = a.r + b.r + PACKING_PADDING;
        if (dist < min) {
          const overlap = (min - dist) / 2;
          const ux = dx / dist;
          const uy = dy / dist;
          a.x -= ux * overlap;
          a.y -= uy * overlap;
          b.x += ux * overlap;
          b.y += uy * overlap;
        }
      }
    }
    // Clamp.
    for (const n of nodes) {
      n.x = Math.max(n.r + 8, Math.min(width - n.r - 8, n.x));
      n.y = Math.max(n.r + 8, Math.min(height - n.r - 8, n.y));
    }
  }

  return nodes;
}
