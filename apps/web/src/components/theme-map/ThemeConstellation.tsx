"use client";

import { useMemo } from "react";

/**
 * Theme Constellation (web) — mirrors the mobile Round 4 design.
 *
 * Hero orb at center, satellites on three ghosted orbital rings. Above
 * the constellation, a narrative sentence that names what the data
 * means. Below the constellation (outside the stage), the hero theme's
 * name on up to two lines. Themes past rank 15 render as a premium
 * strip list below. Pure CSS animations — no JS physics.
 */

type SentimentTone = "positive" | "challenging" | "neutral";

export type ConstellationTheme = {
  id: string;
  name: string;
  mentionCount: number;
  tone: SentimentTone;
};

type ToneSpec = {
  orbBg: string;
  orbGlow: string;
  accent: string;
  labelFg: string;
  stripBg: string;
  stripe: string;
};

const TONE: Record<SentimentTone, ToneSpec> = {
  positive: {
    orbBg: "radial-gradient(115% 95% at 35% 28%, #34D399 0%, #34D399 45%, #064E3B 100%)",
    orbGlow: "rgba(52,211,153,0.55)",
    accent: "#6EE7B7",
    labelFg: "#D1FAE5",
    stripBg: "rgba(6,78,59,0.28)",
    stripe: "#34D399",
  },
  neutral: {
    orbBg: "radial-gradient(115% 95% at 35% 28%, #818CF8 0%, #818CF8 45%, #1E1B4B 100%)",
    orbGlow: "rgba(129,140,248,0.55)",
    accent: "#A5B4FC",
    labelFg: "#DBEAFE",
    stripBg: "rgba(30,27,75,0.42)",
    stripe: "#818CF8",
  },
  challenging: {
    orbBg: "radial-gradient(115% 95% at 35% 28%, #FB7185 0%, #FB7185 45%, #881337 100%)",
    orbGlow: "rgba(251,113,133,0.55)",
    accent: "#FDA4AF",
    labelFg: "#FECDD3",
    stripBg: "rgba(136,19,55,0.28)",
    stripe: "#FB7185",
  },
};

function sentenceCase(s: string): string {
  if (!s) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function buildNarrative(
  themes: ConstellationTheme[],
  timeWindow: string
): string | null {
  const hero = themes[0];
  if (!hero) return null;
  const second = themes[1];
  const timeStr =
    timeWindow === "week"
      ? "this week"
      : timeWindow === "month"
        ? "this month"
        : timeWindow === "3months"
          ? "over the last 3 months"
          : timeWindow === "6months"
            ? "over the last 6 months"
            : "across your history";
  const name = sentenceCase(hero.name);
  const count = hero.mentionCount;
  const countText = `${count} time${count === 1 ? "" : "s"}`;
  if (!second) return `${name} came up ${countText} ${timeStr}.`;
  const ratio = second.mentionCount > 0 ? count / second.mentionCount : 99;
  if (ratio >= 3) return `${name} came up ${countText} ${timeStr} — more than 3× anything else.`;
  if (ratio >= 2) return `${name} came up ${countText} ${timeStr} — twice as often as anything else.`;
  if (ratio >= 1.5) return `${name} led the week at ${countText} — about 1.5× the next theme.`;
  return `${name} came up ${countText} ${timeStr}.`;
}

type OrbitSlot = {
  theme: ConstellationTheme;
  /** x offset from container center, in px */
  x: number;
  /** y offset from container center, in px */
  y: number;
  size: number;
  band: "hero" | "inner" | "middle" | "outer";
  labelPosition: "above" | "below" | "hidden";
};

function buildOrbitLayout(
  themes: ConstellationTheme[],
  radiusUnit: number
): OrbitSlot[] {
  const innerR = radiusUnit * 0.42;
  const middleR = radiusUnit * 0.68;
  const outerR = radiusUnit * 0.94;
  const slots: OrbitSlot[] = [];

  const hero = themes[0];
  if (hero) {
    slots.push({
      theme: hero,
      x: 0,
      y: 0,
      size: 160,
      band: "hero",
      labelPosition: "below",
    });
  }

  const inner = themes.slice(1, 5);
  inner.forEach((t, i) => {
    const angle = (i * (2 * Math.PI)) / Math.max(inner.length, 1);
    const xOff = Math.sin(angle) * innerR;
    const yOff = -Math.cos(angle) * innerR;
    slots.push({
      theme: t,
      x: xOff,
      y: yOff,
      size: 82,
      band: "inner",
      labelPosition: yOff <= 0 ? "above" : "below",
    });
  });

  const middle = themes.slice(5, 10);
  const middleOffset = middle.length > 0 ? Math.PI / middle.length : 0;
  middle.forEach((t, i) => {
    const angle = (i * (2 * Math.PI)) / Math.max(middle.length, 1) + middleOffset;
    const xOff = Math.sin(angle) * middleR;
    const yOff = -Math.cos(angle) * middleR;
    slots.push({
      theme: t,
      x: xOff,
      y: yOff,
      size: 58,
      band: "middle",
      labelPosition: yOff <= 0 ? "above" : "below",
    });
  });

  const outer = themes.slice(10, 15);
  const outerOffset = outer.length > 0 ? Math.PI / (outer.length * 2) : 0;
  outer.forEach((t, i) => {
    const angle = (i * (2 * Math.PI)) / Math.max(outer.length, 1) + outerOffset;
    const xOff = Math.sin(angle) * outerR;
    const yOff = -Math.cos(angle) * outerR;
    slots.push({
      theme: t,
      x: xOff,
      y: yOff,
      size: 40,
      band: "outer",
      labelPosition: "hidden",
    });
  });

  return slots;
}

export function ThemeConstellation({
  themes,
  onTap,
  replayKey = 0,
  timeWindow = "month",
}: {
  themes: ConstellationTheme[];
  onTap?: (id: string) => void;
  replayKey?: number | string;
  /** Accepts any TimeWindow string; narrative adapts. */
  timeWindow?: string;
}) {
  const containerSize = 420;
  const radiusUnit = containerSize / 2;

  const constellationThemes = useMemo(() => themes.slice(0, 15), [themes]);
  const stripThemes = useMemo(() => themes.slice(15), [themes]);
  const slots = useMemo(
    () => buildOrbitLayout(constellationThemes, radiusUnit),
    [constellationThemes, radiusUnit]
  );

  const narrative = useMemo(
    () => buildNarrative(themes, timeWindow),
    [themes, timeWindow]
  );

  const hero = slots.find((s) => s.band === "hero");
  const heroTone: SentimentTone = hero?.theme.tone ?? "neutral";

  if (themes.length === 0) return null;

  return (
    <div className="mt-1">
      <style>{`
        @keyframes breathe-slow {
          0%, 100% { transform: scale(0.97); }
          50%      { transform: scale(1.035); }
        }
        @keyframes enter-orb {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {narrative && (
        <div className="mb-2 py-3">
          <p
            className="uppercase"
            style={{
              fontSize: 10,
              letterSpacing: "1.8px",
              color: "rgba(228,228,231,0.5)",
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            What stood out
          </p>
          <p
            className="text-zinc-100"
            style={{
              fontSize: 18,
              lineHeight: "26px",
              fontWeight: 500,
              letterSpacing: "-0.2px",
            }}
          >
            {narrative}
          </p>
        </div>
      )}

      {/* Stage */}
      <div
        className="relative mx-auto my-3"
        style={{
          width: containerSize,
          height: containerSize,
          maxWidth: "100%",
        }}
      >
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${TONE[heroTone].orbGlow} 0%, rgba(15,13,31,0.5) 55%, rgba(11,11,18,0) 100%)`,
            opacity: 0.18,
          }}
        />

        <OrbitGuides size={containerSize} />

        {slots.map((slot, i) => (
          <Orb
            key={`${slot.theme.id}-${replayKey}`}
            slot={slot}
            index={i}
            containerSize={containerSize}
            onClick={() => onTap?.(slot.theme.id)}
          />
        ))}
      </div>

      {hero && (
        <div className="mt-1 mb-2 flex flex-col items-center gap-1 px-5 text-center">
          <span
            className="uppercase"
            style={{
              fontSize: 10,
              letterSpacing: "1.8px",
              color: TONE[hero.theme.tone].accent,
              fontWeight: 700,
            }}
          >
            Top theme · {hero.theme.mentionCount} mentions
          </span>
          <h2
            className="text-white line-clamp-2"
            style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: "-0.6px",
              lineHeight: "32px",
            }}
          >
            {sentenceCase(hero.theme.name)}
          </h2>
        </div>
      )}

      {stripThemes.length > 0 && (
        <div className="mt-6">
          <p
            className="mb-2.5 ml-1 uppercase"
            style={{
              fontSize: 10,
              letterSpacing: "1.8px",
              color: "rgba(228,228,231,0.5)",
              fontWeight: 700,
            }}
          >
            The rest · {stripThemes.length}
          </p>
          <div className="flex flex-col gap-1.5">
            {stripThemes.map((t, i) => (
              <StripRow
                key={`${t.id}-${replayKey}`}
                theme={t}
                index={i}
                onClick={() => onTap?.(t.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OrbitGuides({ size }: { size: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const radiusUnit = size / 2;
  const innerR = radiusUnit * 0.42;
  const middleR = radiusUnit * 0.68;
  const outerR = radiusUnit * 0.94;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="absolute inset-0 pointer-events-none"
    >
      <circle
        cx={cx}
        cy={cy}
        r={innerR}
        stroke="rgba(255,255,255,0.05)"
        strokeWidth={1}
        strokeDasharray="2 5"
        fill="none"
      />
      <circle
        cx={cx}
        cy={cy}
        r={middleR}
        stroke="rgba(255,255,255,0.04)"
        strokeWidth={1}
        strokeDasharray="2 5"
        fill="none"
      />
      <circle
        cx={cx}
        cy={cy}
        r={outerR}
        stroke="rgba(255,255,255,0.03)"
        strokeWidth={1}
        strokeDasharray="2 5"
        fill="none"
      />
    </svg>
  );
}

function Orb({
  slot,
  index,
  containerSize,
  onClick,
}: {
  slot: OrbitSlot;
  index: number;
  containerSize: number;
  onClick: () => void;
}) {
  const tone = TONE[slot.theme.tone];
  const centerX = containerSize / 2;
  const centerY = containerSize / 2;
  const orbLeft = centerX + slot.x - slot.size / 2;
  const orbTop = centerY + slot.y - slot.size / 2;

  // Breathing cycle: 3.6s base period with a small per-orb variance
  // so the constellation never beats in unison.
  const breathDuration = 3.6 + ((index * 0.23) % 1.2);
  const breathDelay = ((index * 0.37) % 2.4).toFixed(2);
  const entryDelay = Math.min(index * 55, 600);

  const fontSize =
    slot.band === "hero"
      ? 44
      : slot.band === "inner"
        ? 20
        : slot.band === "middle"
          ? 15
          : 12;

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-label={`${slot.theme.name}, ${slot.theme.mentionCount} mentions`}
        className="absolute rounded-full p-0 border-0 flex items-center justify-center transition-transform hover:scale-[1.04] active:scale-[0.97]"
        style={{
          left: orbLeft,
          top: orbTop,
          width: slot.size,
          height: slot.size,
          background: tone.orbBg,
          boxShadow: `0 0 ${slot.size * 0.65}px ${tone.orbGlow}, inset 0 2px 2px rgba(255,255,255,0.22)`,
          animation: `enter-orb 420ms cubic-bezier(0.22,1,0.36,1) ${entryDelay}ms both, breathe-slow ${breathDuration.toFixed(2)}s ease-in-out ${breathDelay}s infinite`,
          cursor: "pointer",
        }}
      >
        <span
          className="text-white font-bold"
          style={{
            fontSize,
            letterSpacing: slot.band === "hero" ? "-1.4px" : "-0.4px",
            lineHeight: 1,
          }}
        >
          {slot.theme.mentionCount}
        </span>
      </button>

      {slot.labelPosition !== "hidden" && slot.band !== "hero" && (
        <span
          className="absolute text-center truncate pointer-events-none"
          style={{
            left: centerX + slot.x - 50,
            top:
              slot.labelPosition === "above"
                ? centerY + slot.y - slot.size / 2 - 24
                : centerY + slot.y + slot.size / 2 + 8,
            width: 100,
            fontSize: 11,
            fontWeight: 600,
            color: "rgba(228,228,231,0.86)",
            letterSpacing: "-0.1px",
            animation: `enter-orb 420ms cubic-bezier(0.22,1,0.36,1) ${entryDelay + 200}ms both`,
          }}
        >
          {sentenceCase(slot.theme.name)}
        </span>
      )}
    </>
  );
}

function StripRow({
  theme,
  index,
  onClick,
}: {
  theme: ConstellationTheme;
  index: number;
  onClick: () => void;
}) {
  const tone = TONE[theme.tone];
  const delay = Math.min(index * 30, 400);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${theme.name}, ${theme.mentionCount} mentions`}
      className="relative flex w-full items-center overflow-hidden rounded-2xl border py-3 pl-5 pr-4 text-left transition-colors hover:brightness-110"
      style={{
        borderColor: "rgba(255,255,255,0.04)",
        background: tone.stripBg,
        animation: `enter-orb 320ms cubic-bezier(0.22,1,0.36,1) ${delay}ms both`,
      }}
    >
      <span
        className="absolute rounded-full"
        style={{
          left: 0,
          top: 10,
          bottom: 10,
          width: 3,
          backgroundColor: tone.stripe,
          boxShadow: `0 0 8px ${tone.stripe}`,
        }}
      />
      <span
        className="flex-1 truncate text-zinc-50"
        style={{
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: "-0.1px",
        }}
      >
        {sentenceCase(theme.name)}
      </span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: tone.accent,
          letterSpacing: "-0.2px",
        }}
      >
        {theme.mentionCount}
      </span>
    </button>
  );
}
