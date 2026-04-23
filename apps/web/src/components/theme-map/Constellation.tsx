"use client";

/**
 * The hero: hero node at center with 5 "planets" that fly in on orbital
 * sweeps (540° = 1.5 revolutions, NOT 2 — 2 was dizzying), land in
 * final positions, then breathe in place. Connection lines draw to 4
 * of 5 planets after the orbital entrance finishes (top planet "E"
 * stays unconnected to keep the top clean).
 *
 * All animation values below come from the spec. Do not "improve" them
 * without updating the spec + re-viewing the mockup.
 *
 * Reduced motion: a media query at the bottom of this file disables
 * every animation and renders planets at their landed positions.
 */

type SentimentTone = "positive" | "challenging" | "neutral";

export type ConstellationTheme = {
  id: string;
  name: string;
  tone: SentimentTone;
  /** Relative size: large | medium | small. Drives halo + core radius. */
  size?: "large" | "medium" | "small";
};

export type ConstellationProps = {
  hero: { id: string; name: string };
  planets: ConstellationTheme[]; // up to 5; anything beyond is dropped
  onTapHero?: () => void;
  onTapPlanet?: (id: string) => void;
};

// Landed positions (svg px, viewBox 0 0 350 280, hero at 175,140).
const SLOTS = [
  { x: 85, y: 80, halo: 40, core: 22, glow: true }, // A: upper-left
  { x: 280, y: 80, halo: 35, core: 20, glow: true }, // B: upper-right
  { x: 85, y: 210, halo: 30, core: 16, glow: true }, // C: lower-left
  { x: 280, y: 210, halo: 28, core: 14, glow: false }, // D: lower-right
  { x: 175, y: 40, halo: 24, core: 12, glow: false }, // E: top
] as const;

const TONE_CORE: Record<SentimentTone, string> = {
  positive: "#34D399",
  challenging: "#F87171",
  neutral: "#94a3b8",
};

const TONE_GLOW: Record<SentimentTone, string> = {
  positive: "rgba(52,211,153,0.55)",
  challenging: "rgba(248,113,113,0.55)",
  neutral: "rgba(148,163,184,0.35)",
};

export function Constellation({
  hero,
  planets,
  onTapHero,
  onTapPlanet,
}: ConstellationProps) {
  // Clip to 5 planets max. Slots[i] defines the landed target for
  // planet i. The data order determines which planet gets which slot.
  const placed = planets.slice(0, 5);

  return (
    <div
      className="relative rounded-3xl border border-zinc-200 dark:border-white/10 overflow-hidden"
      style={{
        margin: "20px 0",
        // Extra vertical padding gives the orbital entrance animation
        // room to arc without clipping — planets rotate through
        // translateX(180) at radii up to ~180 during spin-in, which
        // extends well beyond the landed positions. Side padding kept
        // generous too so long theme labels don't clip to the border.
        padding: "60px 32px",
        background:
          "linear-gradient(180deg, rgba(124,58,237,0.06) 0%, rgba(124,58,237,0) 100%)",
      }}
    >
      {/* Radial overlay — pseudo-element equivalent, pointer-events none */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-3xl"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(124,58,237,0.10), transparent 65%)",
        }}
      />

      <svg
        viewBox="-40 -40 430 360"
        style={{ width: "100%", height: 340, overflow: "visible" }}
        aria-label="Theme constellation"
      >
        <defs>
          <radialGradient id="heroHalo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(124,58,237,0.55)" />
            <stop offset="100%" stopColor="rgba(124,58,237,0)" />
          </radialGradient>
          {(["positive", "challenging", "neutral"] as const).map((tone) => (
            <radialGradient
              key={`halo-${tone}`}
              id={`halo-${tone}`}
              cx="50%"
              cy="50%"
              r="50%"
            >
              <stop offset="0%" stopColor={TONE_GLOW[tone]} />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
          ))}
        </defs>

        {/* Connection lines — hero → planets A/B/C/D (NOT E). Drawn
            before the planets themselves so they layer underneath. */}
        {placed.slice(0, 4).map((_, i) => {
          const slot = SLOTS[i];
          return (
            <line
              key={`line-${i}`}
              className={`tm-line tm-line-${i + 1}`}
              x1={175}
              y1={140}
              x2={slot.x}
              y2={slot.y}
              stroke="#7C3AED"
              strokeWidth={1}
              strokeOpacity={0.3}
              strokeDasharray={400}
              strokeDashoffset={400}
            />
          );
        })}

        {/* Hero ripple ring + halo + core */}
        <g className="tm-hero">
          <circle
            className="tm-hero-halo"
            cx={175}
            cy={140}
            r={55}
            fill="url(#heroHalo)"
            opacity={0.7}
          />
          <circle
            className="tm-hero-ripple"
            cx={175}
            cy={140}
            r={32}
            fill="none"
            stroke="#7C3AED"
            strokeWidth={1.5}
          />
          <g className="tm-hero-core-group">
            <circle
              cx={175}
              cy={140}
              r={32}
              fill="#7C3AED"
              style={{ filter: "drop-shadow(0 0 12px rgba(124,58,237,0.7))" }}
            />
            <text
              x={175}
              y={144}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              fill="white"
              style={{ letterSpacing: "0.5px" }}
            >
              {(hero.name ?? "").toUpperCase()}
            </text>
          </g>
          {/* Invisible tap target */}
          <circle
            cx={175}
            cy={140}
            r={55}
            fill="transparent"
            style={{ cursor: onTapHero ? "pointer" : "default" }}
            onClick={onTapHero}
          />
        </g>

        {/* Planets */}
        {placed.map((p, i) => {
          const slot = SLOTS[i];
          const tone = p.tone;
          return (
            <g
              key={p.id}
              className={`tm-planet tm-planet-${i + 1}`}
              style={{ transformOrigin: "175px 140px" }}
            >
              <g transform={`translate(${slot.x}, ${slot.y})`}>
                <circle
                  r={slot.halo}
                  fill={`url(#halo-${tone})`}
                  opacity={0.8}
                />
                <circle
                  r={slot.core}
                  fill={TONE_CORE[tone]}
                  style={
                    slot.glow
                      ? {
                          filter: `drop-shadow(0 0 10px ${TONE_GLOW[tone]})`,
                        }
                      : undefined
                  }
                />
                {/* Tap target */}
                <circle
                  r={slot.halo}
                  fill="transparent"
                  style={{ cursor: onTapPlanet ? "pointer" : "default" }}
                  onClick={() => onTapPlanet?.(p.id)}
                />
                {/* Label — uppercase, wraps to two lines on long names.
                    Positioned below each planet (above for top slot E). */}
                <PlanetLabel
                  name={p.name}
                  index={i}
                  anchorY={i === 4 ? -slot.halo - 12 : slot.halo + 18}
                  above={i === 4}
                />
              </g>
            </g>
          );
        })}
      </svg>

      {/* Legend — fades in at 7.0s */}
      <div
        className="tm-legend flex items-center gap-5 mt-2 pt-3 text-xs"
        style={{
          borderTop: "1px solid var(--border, rgba(148,163,184,0.25))",
          color: "rgba(148,163,184,0.75)",
          opacity: 0,
        }}
      >
        <LegendDot color="#F87171" glow label="Challenging" />
        <LegendDot color="#94a3b8" label="Neutral" />
        <LegendDot color="#34D399" glow label="Positive" />
      </div>

      {/* Animation styles — scoped via the tm-* class prefix. Kept
          inline so the exact keyframe values from the spec live next
          to the markup that references them. */}
      <style jsx>{`
        /* ── Hero entrance + breathing + ripple ─────────────────── */
        .tm-hero {
          animation: tmHeroFall 1s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both;
          transform-origin: 175px 140px;
        }
        .tm-hero-core-group {
          transform-origin: 175px 140px;
          animation: tmHeroBreathe 4s ease-in-out 7s infinite;
        }
        .tm-hero-ripple {
          transform-origin: 175px 140px;
          animation: tmHeroRipple 3s ease-out 7s infinite;
        }
        @keyframes tmHeroFall {
          0% {
            transform: translateY(-180px) scale(0.4);
            opacity: 0;
          }
          60% {
            opacity: 1;
            transform: translateY(0) scale(1.1);
          }
          100% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }
        @keyframes tmHeroBreathe {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.07);
          }
        }
        @keyframes tmHeroRipple {
          0% {
            r: 32;
            opacity: 0.5;
          }
          100% {
            r: 62;
            opacity: 0;
          }
        }

        /* ── Planet orbital entrances ───────────────────────────── */
        .tm-planet {
          opacity: 0;
          animation-timing-function: cubic-bezier(0.33, 0, 0.15, 1);
          animation-fill-mode: forwards;
        }
        .tm-planet-1 {
          animation-name: tmPlanet1;
          animation-duration: 3.2s;
          animation-delay: 0.6s;
        }
        .tm-planet-2 {
          animation-name: tmPlanet2;
          animation-duration: 3.4s;
          animation-delay: 1s;
        }
        .tm-planet-3 {
          animation-name: tmPlanet3;
          animation-duration: 3.6s;
          animation-delay: 1.4s;
        }
        .tm-planet-4 {
          animation-name: tmPlanet4;
          animation-duration: 3.8s;
          animation-delay: 1.8s;
        }
        .tm-planet-5 {
          animation-name: tmPlanet5;
          animation-duration: 3.4s;
          animation-delay: 2.2s;
        }
        @keyframes tmPlanet1 {
          0% {
            transform: rotate(0deg) translateX(180px) rotate(0deg);
            opacity: 0;
          }
          12% {
            opacity: 1;
          }
          100% {
            transform: rotate(394deg) translateX(108px) rotate(-394deg);
            opacity: 1;
          }
        }
        @keyframes tmPlanet2 {
          0% {
            transform: rotate(60deg) translateX(180px) rotate(-60deg);
            opacity: 0;
          }
          12% {
            opacity: 1;
          }
          100% {
            transform: rotate(510deg) translateX(121px) rotate(-510deg);
            opacity: 1;
          }
        }
        @keyframes tmPlanet3 {
          0% {
            transform: rotate(-90deg) translateX(180px) rotate(90deg);
            opacity: 0;
          }
          12% {
            opacity: 1;
          }
          100% {
            transform: rotate(322deg) translateX(114px) rotate(-322deg);
            opacity: 1;
          }
        }
        @keyframes tmPlanet4 {
          0% {
            transform: rotate(180deg) translateX(180px) rotate(-180deg);
            opacity: 0;
          }
          12% {
            opacity: 1;
          }
          100% {
            transform: rotate(574deg) translateX(126px) rotate(-574deg);
            opacity: 1;
          }
        }
        @keyframes tmPlanet5 {
          0% {
            transform: rotate(120deg) translateX(170px) rotate(-120deg);
            opacity: 0;
          }
          12% {
            opacity: 1;
          }
          100% {
            transform: rotate(450deg) translateX(100px) rotate(-450deg);
            opacity: 1;
          }
        }

        /* ── Planet labels (stagger fade-in after land) ─────────── */
        :global(.tm-label) {
          animation: tmLabelIn 0.5s ease-out forwards;
        }
        :global(.tm-label-1) {
          animation-delay: 4s;
        }
        :global(.tm-label-2) {
          animation-delay: 4.6s;
        }
        :global(.tm-label-3) {
          animation-delay: 5.2s;
        }
        :global(.tm-label-4) {
          animation-delay: 5.8s;
        }
        :global(.tm-label-5) {
          animation-delay: 5.8s;
        }
        @keyframes tmLabelIn {
          to {
            opacity: 1;
          }
        }

        /* ── Connection lines (draw after planets land) ─────────── */
        :global(.tm-line) {
          animation: tmLineIn 0.8s ease-out forwards;
        }
        :global(.tm-line-1) {
          animation-delay: 6.2s;
        }
        :global(.tm-line-2) {
          animation-delay: 6.4s;
        }
        :global(.tm-line-3) {
          animation-delay: 6.6s;
        }
        :global(.tm-line-4) {
          animation-delay: 6.8s;
        }
        @keyframes tmLineIn {
          to {
            stroke-dashoffset: 0;
          }
        }

        /* ── Legend ─────────────────────────────────────────────── */
        .tm-legend {
          animation: tmFadeIn 0.6s ease-out 7s forwards;
        }
        @keyframes tmFadeIn {
          to {
            opacity: 1;
          }
        }

        /* ── Reduced motion: land state, no entrance ────────────── */
        @media (prefers-reduced-motion: reduce) {
          .tm-hero,
          .tm-hero-core-group,
          .tm-hero-ripple,
          .tm-planet,
          :global(.tm-label),
          :global(.tm-line),
          .tm-legend {
            animation: none !important;
            opacity: 1 !important;
          }
          .tm-planet-1 {
            transform: rotate(394deg) translateX(108px) rotate(-394deg);
          }
          .tm-planet-2 {
            transform: rotate(510deg) translateX(121px) rotate(-510deg);
          }
          .tm-planet-3 {
            transform: rotate(322deg) translateX(114px) rotate(-322deg);
          }
          .tm-planet-4 {
            transform: rotate(574deg) translateX(126px) rotate(-574deg);
          }
          .tm-planet-5 {
            transform: rotate(450deg) translateX(100px) rotate(-450deg);
          }
          :global(.tm-line) {
            stroke-dashoffset: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Planet label renderer — uppercase, wraps to two lines on longer
 * names (split on last space before midpoint). Keeps SVG text
 * readable on narrow containers where truncation used to hit.
 */
function PlanetLabel({
  name,
  index,
  anchorY,
  above,
}: {
  name: string;
  index: number;
  anchorY: number;
  above: boolean;
}) {
  const upper = (name ?? "").toUpperCase();
  const fontSize = index <= 1 ? 11 : 10;
  const fill =
    index <= 1 ? "rgba(250,250,250,0.9)" : "rgba(250,250,250,0.65)";
  // Wrap at the space nearest the midpoint for names > 16 chars.
  const lines = wrapLabel(upper, 16);
  // For two-line labels above the planet, stack upward (earlier line
  // first). Below the planet, stack downward.
  const lineHeight = fontSize + 3;
  return (
    <text
      className={`tm-label tm-label-${index + 1}`}
      x={0}
      y={anchorY}
      textAnchor="middle"
      fontSize={fontSize}
      fontWeight={600}
      fill={fill}
      opacity={0}
      style={{ letterSpacing: "0.5px" }}
    >
      {lines.map((ln, i) => (
        <tspan
          key={i}
          x={0}
          dy={i === 0 ? 0 : lineHeight}
        >
          {ln}
        </tspan>
      ))}
      {/* One-line labels above a planet don't need vertical shift;
          two-line labels above need to start one line higher so the
          SECOND line lands at anchorY (anchor was the bottom line). */}
      {above && lines.length > 1 ? (
        <tspan x={0} dy={-lineHeight * lines.length} />
      ) : null}
    </text>
  );
}

function wrapLabel(label: string, maxLen: number): string[] {
  if (label.length <= maxLen) return [label];
  const mid = Math.floor(label.length / 2);
  // Find the space nearest the midpoint (search outward from mid).
  let splitAt = -1;
  for (let offset = 0; offset < label.length; offset++) {
    const left = mid - offset;
    const right = mid + offset;
    if (left >= 0 && label[left] === " ") {
      splitAt = left;
      break;
    }
    if (right < label.length && label[right] === " ") {
      splitAt = right;
      break;
    }
  }
  if (splitAt < 0) return [label];
  return [label.slice(0, splitAt), label.slice(splitAt + 1)];
}

function LegendDot({
  color,
  label,
  glow,
}: {
  color: string;
  label: string;
  glow?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="block h-2 w-2 rounded-full"
        style={{
          backgroundColor: color,
          boxShadow: glow ? `0 0 8px ${color}` : "none",
        }}
      />
      {label}
    </span>
  );
}
