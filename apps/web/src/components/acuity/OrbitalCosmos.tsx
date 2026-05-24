"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * OrbitalCosmos — web port of `apps/mobile/app/insights/_theme-map/
 * OrbitalCosmos.tsx`. Slice 24 / 6b (2026-05-24).
 *
 * Mirrors the mobile composition exactly:
 *   - 402×360 viewBox; CX=201, CY=180
 *   - Ring radii [78, 110, 140, 168]
 *   - Up to 6 themes (filter mentionCount >= 2 + sort desc applied by
 *     caller; this component just renders what it's given)
 *   - Slot distribution by count: 2 → ring 0×2; 3 → ring 0×2 + ring 1;
 *     4 → ring 0×2 + ring 1×2; 5 → +ring 2; 6 → +ring 2 pair
 *   - Planet size = 20 + (mentionCount/maxMentionCount)×12, cap 32
 *   - Atmospheric 4-stop radial planet gradient at HSL saturation 42%
 *   - Sun: body 22, dashed frame 30, halo 44
 *   - 70 deterministic stars via (i*137)%w, (i*89)%h
 *   - Mono fontSize 11 labels, 2-line wrap at 14-char threshold
 *   - Spin-in choreography: planets start at target angle − 90°,
 *     rotate +90° over 1.2s with easeOutCubic, 0.15s stagger.
 *     Sun 0.0-0.6s; ring guides 0.6-1.8s; planets 1.5s+; connector
 *     lines 4.0-4.8s. Total ~4.8s.
 *   - Once-per-session: subsequent renders within the same browser
 *     session skip the entrance animation (sessionStorage key).
 *
 * Web idiom translations:
 *   - RN SVG → plain SVG. Mobile's `<RadialGradient>` and
 *     `<LinearGradient>` come from `react-native-svg`; the web SVG
 *     equivalents are direct DOM elements.
 *   - Reanimated worklets → vanilla rAF in a useEffect. A single
 *     time-driven progress map (0..1 per ring/planet/line) re-renders
 *     the SVG; React's reconciler handles the DOM updates efficiently
 *     at 60fps for ~12 animated paths. No need for framer-motion.
 *   - AsyncStorage → sessionStorage (sync, browser-native, same
 *     key shape).
 */

export interface OrbitalTheme {
  id: string;
  name: string;
  /** Canonical hue 0-359 from the canonical 9 + FNV-1a hash fallback
   *  (caller computes; see apps/mobile/app/insights/_theme-map/
   *  types.ts → hueForTheme). */
  hue: number;
  mentionCount: number;
  sentimentBand: "positive" | "neutral" | "challenging";
}

interface SlotConfig {
  ring: number;
  angle: number;
  delay: number;
}

/** Slot positions by visible-theme count. 1:1 with mobile spec. */
function getSlotsForCount(n: number): SlotConfig[] {
  if (n <= 0) return [];
  if (n === 1) return [{ ring: 0, angle: 30, delay: 1500 }];
  if (n === 2) {
    return [
      { ring: 0, angle: 30, delay: 1500 },
      { ring: 0, angle: 200, delay: 1650 },
    ];
  }
  if (n === 3) {
    return [
      { ring: 0, angle: 30, delay: 1500 },
      { ring: 0, angle: 200, delay: 1650 },
      { ring: 1, angle: 130, delay: 1800 },
    ];
  }
  if (n === 4) {
    return [
      { ring: 0, angle: 30, delay: 1500 },
      { ring: 0, angle: 200, delay: 1650 },
      { ring: 1, angle: 130, delay: 1800 },
      { ring: 1, angle: 320, delay: 1950 },
    ];
  }
  if (n === 5) {
    return [
      { ring: 0, angle: 30, delay: 1500 },
      { ring: 0, angle: 200, delay: 1650 },
      { ring: 1, angle: 130, delay: 1800 },
      { ring: 1, angle: 320, delay: 1950 },
      { ring: 2, angle: 350, delay: 2100 },
    ];
  }
  // n >= 6
  return [
    { ring: 0, angle: 30, delay: 1500 },
    { ring: 0, angle: 200, delay: 1650 },
    { ring: 1, angle: 130, delay: 1800 },
    { ring: 1, angle: 320, delay: 1950 },
    { ring: 2, angle: 190, delay: 2100 },
    { ring: 2, angle: 350, delay: 2250 },
  ];
}

const BASE_PLANET_SIZE = 20;
const MAX_PLANET_BONUS = 12;
const MAX_PLANETS = 6;
const WRAP_THRESHOLD = 14;

const RING_RADII = [78, 110, 140, 168];
const VIEWBOX_W = 402;
const VIEWBOX_H = 360;
const CX = 201;
const CY = 180;
const SPIN_DURATION_MS = 1200;
const SUN_DURATION_MS = 600;
const RING_DURATION_MS = 1200;
const LINE_DURATION_MS = 800;
const SUN_START_MS = 0;
const RING_START_MS = 600;
const LINE_START_MS = 4000;
const TOTAL_ANIM_MS = 4800;
const SESSION_KEY = "acuity-orbital-cosmos-seen";

/** easeOutCubic — `1 - (1-t)^3`. Matches mobile's Easing.out(cubic). */
function easeOutCubic(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - x, 3);
}

/** Linear progress 0..1 between [start, start+duration] ms. */
function rampProgress(now: number, start: number, duration: number): number {
  if (now < start) return 0;
  const t = (now - start) / duration;
  if (t >= 1) return 1;
  return t;
}

/** Wrap label to 1 or 2 lines at WRAP_THRESHOLD characters. */
function wrapLabel(text: string): { line1: string; line2: string | null } {
  if (text.length <= WRAP_THRESHOLD) return { line1: text, line2: null };
  let splitAt = text.lastIndexOf(" ", WRAP_THRESHOLD);
  if (splitAt < 1) splitAt = WRAP_THRESHOLD;
  const line1 = text.slice(0, splitAt).trim();
  let line2 = text.slice(splitAt).trim();
  if (line2.length > WRAP_THRESHOLD) {
    line2 = line2.slice(0, WRAP_THRESHOLD - 1) + "…";
  }
  return { line1, line2 };
}

function sizeForMentionCount(
  mentionCount: number,
  maxMentionCount: number
): number {
  if (maxMentionCount <= 0) return BASE_PLANET_SIZE;
  const ratio = Math.max(0, Math.min(1, mentionCount / maxMentionCount));
  return BASE_PLANET_SIZE + ratio * MAX_PLANET_BONUS;
}

export interface OrbitalCosmosProps {
  themes: OrbitalTheme[];
  /** Width in px. Component scales height proportionally to maintain
   *  the 402:360 viewBox aspect. */
  width: number;
  /** First initial for the center sun. Defaults to "•". */
  centerInitial?: string;
  /** Tap handler — navigate to /insights/theme/[themeId] in the
   *  consuming page. */
  onPlanetTap?: (theme: OrbitalTheme) => void;
}

export function OrbitalCosmos({
  themes,
  width,
  centerInitial,
  onPlanetTap,
}: OrbitalCosmosProps) {
  const height = (width * VIEWBOX_H) / VIEWBOX_W;
  const visibleThemes = useMemo(
    () => themes.slice(0, MAX_PLANETS),
    [themes]
  );
  const slotConfigs = getSlotsForCount(visibleThemes.length);

  const maxMentionCount = useMemo(
    () =>
      visibleThemes.reduce(
        (max, t) => (t.mentionCount > max ? t.mentionCount : max),
        0
      ),
    [visibleThemes]
  );

  // Slot positions: target radius, final XY, start angle (target − 90°),
  // size from mentionCount.
  const slots = useMemo(
    () =>
      slotConfigs.map((cfg, i) => {
        const targetRad = (cfg.angle * Math.PI) / 180;
        const startAngleDeg = cfg.angle - 90;
        const startRad = (startAngleDeg * Math.PI) / 180;
        const r = RING_RADII[cfg.ring];
        const theme = visibleThemes[i];
        const planetSize = theme
          ? sizeForMentionCount(theme.mentionCount, maxMentionCount)
          : BASE_PLANET_SIZE;
        return {
          ...cfg,
          size: planetSize,
          startRad,
          targetRad,
          finalX: CX + Math.cos(targetRad) * r,
          finalY: CY + Math.sin(targetRad) * r,
          ringRadius: r,
        };
      }),
    [slotConfigs, visibleThemes, maxMentionCount]
  );

  // Once-per-session animation gate. sessionStorage key set after first
  // mount; subsequent mounts within the same browser session skip
  // animation and render at the final state.
  const [shouldAnimate, setShouldAnimate] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefersReducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    let alreadySeen = false;
    try {
      alreadySeen = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      alreadySeen = false;
    }
    if (prefersReducedMotion || alreadySeen) {
      setShouldAnimate(false);
      return;
    }
    setShouldAnimate(true);
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Persistence failure is acceptable; worst case the entrance
      // animation runs on the next visit too.
    }
  }, []);

  // RAF-driven progress: a single time origin + per-element ramp
  // computations. React state holds the elapsed-ms value; the SVG
  // re-renders ~60 times per second over the 4.8s entrance.
  const [elapsed, setElapsed] = useState(shouldAnimate ? 0 : TOTAL_ANIM_MS);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!shouldAnimate) {
      setElapsed(TOTAL_ANIM_MS);
      return;
    }
    const start = performance.now();
    function tick(now: number) {
      const t = now - start;
      setElapsed(Math.min(t, TOTAL_ANIM_MS));
      if (t < TOTAL_ANIM_MS) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [shouldAnimate]);

  const sunOpacity = easeOutCubic(
    rampProgress(elapsed, SUN_START_MS, SUN_DURATION_MS)
  );
  const ringOpacity = easeOutCubic(
    rampProgress(elapsed, RING_START_MS, RING_DURATION_MS)
  );
  const lineOpacity =
    easeOutCubic(rampProgress(elapsed, LINE_START_MS, LINE_DURATION_MS)) *
    0.6;

  // Per-planet progress at THIS frame's elapsed value.
  function planetState(slotIdx: number) {
    const slot = slots[slotIdx];
    if (!slot) return null;
    const linear = rampProgress(elapsed, slot.delay, SPIN_DURATION_MS);
    const t = easeOutCubic(linear);
    const angle = slot.startRad + (slot.targetRad - slot.startRad) * t;
    return {
      cx: CX + Math.cos(angle) * slot.ringRadius,
      cy: CY + Math.sin(angle) * slot.ringRadius,
      opacity: t,
      // label fades in faster (square the opacity so it's mostly hidden
      // until the planet is settling, matching mobile's label feel)
      labelOpacity: t * t,
    };
  }

  // The "outermost ring + 1" guide rule — show one extra empty ring
  // beyond the highest-used slot as a visual hint, but never all 4.
  const maxRingInUse = slots.reduce((max, s) => Math.max(max, s.ring), -1);

  // Deterministic 70-star field. Same pattern every render.
  const stars = useMemo(() => {
    const out: { cx: number; cy: number; r: number; o: number }[] = [];
    for (let i = 0; i < 70; i++) {
      const cx = (i * 137) % VIEWBOX_W;
      const cy = (i * 89) % VIEWBOX_H;
      const r = i % 7 === 0 ? 1.4 : 0.7;
      const o = 0.2 + ((i * 7) % 60) / 100;
      out.push({ cx, cy, r, o });
    }
    return out;
  }, []);

  return (
    <div style={{ width, height }} className="relative">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        role="img"
        aria-label={`Theme orbital with ${visibleThemes.length} active themes`}
      >
        <defs>
          <radialGradient id="orb-you-glow" cx="50%" cy="50%" r="50%">
            <stop
              offset="0%"
              stopColor="var(--acuity-primary)"
              stopOpacity={0.45}
            />
            <stop
              offset="100%"
              stopColor="var(--acuity-primary)"
              stopOpacity={0}
            />
          </radialGradient>
          <linearGradient id="orb-you-body" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--acuity-primary)" />
            <stop offset="100%" stopColor="var(--acuity-secondary)" />
          </linearGradient>
          {visibleThemes.map((theme, i) => (
            <radialGradient
              key={`planet-grad-${i}`}
              id={`orb-planet-grad-${i}`}
              cx="50%"
              cy="50%"
              r="60%"
            >
              {/* Atmospheric 4-stop: center-to-limb darkening, no
                  directional highlight, saturation 42% per Phase E
                  polish 4 — keeps the planets distant celestial
                  rather than UI buttons. */}
              <stop offset="0%" stopColor={`hsl(${theme.hue}, 42%, 52%)`} />
              <stop offset="40%" stopColor={`hsl(${theme.hue}, 42%, 48%)`} />
              <stop offset="80%" stopColor={`hsl(${theme.hue}, 38%, 42%)`} />
              <stop
                offset="100%"
                stopColor={`hsl(${theme.hue}, 30%, 36%)`}
              />
            </radialGradient>
          ))}
        </defs>

        {/* Star field — dim atmospheric backdrop. Color follows the
            text-quiet token so it stays visible against either light or
            dark surfaces. */}
        <g>
          {stars.map((s, i) => (
            <circle
              key={`star-${i}`}
              cx={s.cx}
              cy={s.cy}
              r={s.r}
              fill="var(--acuity-text-quiet)"
              opacity={s.o * 0.4}
            />
          ))}
        </g>

        {/* Ring guides — innermost solid, others dashed. Only render
            up to maxRingInUse + 1 so empty-ring count doesn't shout. */}
        <g opacity={ringOpacity}>
          {RING_RADII.map((r, i) => {
            if (i > maxRingInUse + 1) return null;
            return (
              <circle
                key={`ring-${i}`}
                cx={CX}
                cy={CY}
                r={r}
                fill="none"
                stroke="var(--acuity-primary)"
                strokeOpacity={0.18}
                strokeWidth={0.8}
                strokeDasharray={i === 0 ? undefined : "4 4"}
              />
            );
          })}
        </g>

        {/* Dashed connector lines from center to each planet — fade
            in last so they don't compete with the spin-in. */}
        <g opacity={lineOpacity}>
          {visibleThemes.map((theme, i) => {
            const slot = slots[i];
            if (!slot) return null;
            return (
              <line
                key={`conn-${i}`}
                x1={CX}
                y1={CY}
                x2={slot.finalX}
                y2={slot.finalY}
                stroke={`hsl(${theme.hue}, 55%, 60%)`}
                strokeOpacity={0.35}
                strokeWidth={0.7}
                strokeDasharray="1.5 3"
              />
            );
          })}
        </g>

        {/* Center sun — halo (44), dashed frame (30), body (22), initial
            text + "YOU" subtitle. Body uses gradMix-equivalent
            primary→secondary linear gradient. */}
        <g opacity={sunOpacity}>
          <circle cx={CX} cy={CY} r={44} fill="url(#orb-you-glow)" />
          <circle
            cx={CX}
            cy={CY}
            r={30}
            fill="none"
            stroke="var(--acuity-line)"
            strokeWidth={0.6}
            strokeDasharray="2 4"
          />
          <circle
            cx={CX}
            cy={CY}
            r={22}
            fill="url(#orb-you-body)"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth={1.5}
          />
          <text
            x={CX}
            y={CY + 6}
            textAnchor="middle"
            fontSize={18}
            fontWeight={800}
            fill="#FFFFFF"
            style={{ letterSpacing: "-0.4px", fontFamily: "var(--font-display)" }}
          >
            {centerInitial ?? "•"}
          </text>
          <text
            x={CX}
            y={CY + 40}
            textAnchor="middle"
            fontSize={9}
            fontWeight={700}
            fill="var(--acuity-text-sec)"
            style={{ letterSpacing: "1.6px", fontFamily: "var(--font-geist-mono)" }}
          >
            YOU
          </text>
        </g>

        {/* Planets + labels */}
        {visibleThemes.map((theme, i) => {
          const slot = slots[i];
          const state = planetState(i);
          if (!slot || !state) return null;
          const planetR = slot.size / 2;
          const wrapped = wrapLabel(theme.name);
          // Use final x/y for label positioning so the label doesn't
          // sweep with the spin-in — only the planet circle moves.
          const labelY = slot.finalY + planetR + 13;
          const line2Y = labelY + 11;
          const countY = wrapped.line2 ? line2Y + 11 : labelY + 11;
          return (
            <g
              key={`planet-${i}`}
              onClick={() => onPlanetTap?.(theme)}
              style={{ cursor: onPlanetTap ? "pointer" : "default" }}
            >
              <circle
                cx={state.cx}
                cy={state.cy}
                r={planetR}
                fill={`url(#orb-planet-grad-${i})`}
                opacity={state.opacity}
              />
              <g opacity={state.labelOpacity}>
                <text
                  x={slot.finalX}
                  y={labelY}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill="var(--acuity-text-sec)"
                  fillOpacity={0.85}
                  style={{
                    letterSpacing: "0.4px",
                    fontFamily: "var(--font-geist-mono)",
                  }}
                >
                  <tspan>{wrapped.line1}</tspan>
                  {wrapped.line2 && (
                    <tspan x={slot.finalX} dy={11}>
                      {wrapped.line2}
                    </tspan>
                  )}
                </text>
                <text
                  x={slot.finalX}
                  y={countY}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={600}
                  fill="var(--acuity-text-ter)"
                  style={{
                    letterSpacing: "0.8px",
                    fontFamily: "var(--font-geist-mono)",
                  }}
                >
                  {theme.mentionCount}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** FNV-1a hash → 0-359 hue for non-canonical theme names. Matches
 *  mobile's `apps/mobile/app/insights/_theme-map/types.ts → hueForTheme`
 *  fallback. Exported here so consumers can map free-text theme names
 *  to the same hue mobile uses. */
const CANONICAL_HUES: Record<string, number> = {
  career: 295,
  family: 25,
  health: 165,
  avoidance: 60,
  money: 115,
  relationships: 345,
  sleep: 235,
  growth: 195,
  solitude: 275,
};

export function hueForTheme(name: string): number {
  const key = name.toLowerCase().trim();
  if (CANONICAL_HUES[key] !== undefined) return CANONICAL_HUES[key];
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash) % 360;
}
