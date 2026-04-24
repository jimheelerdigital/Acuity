"use client";

import { useMemo } from "react";

/**
 * ThemeGallery — web parity for the mobile component. Editorial
 * hierarchy: hero card (rank 1), 2-up row (2–3), 2×2 grid (4–7),
 * premium strip rows (8+). Sentiment → gradient hue. Typography
 * weight + card size → frequency. Staggered CSS entrance.
 */

type SentimentTone = "positive" | "challenging" | "neutral";

export type GalleryTheme = {
  id: string;
  name: string;
  mentionCount: number;
  tone: SentimentTone;
};

type ToneStyle = {
  bgGradient: string;
  glowGradient: string;
  accent: string;
  numberFg: string;
  stripe: string;
  shadow: string;
};

const TONE: Record<SentimentTone, ToneStyle> = {
  positive: {
    bgGradient:
      "radial-gradient(120% 95% at 85% 10%, rgba(52,211,153,0.42) 0%, #064E3B 55%, #022C22 100%)",
    glowGradient:
      "radial-gradient(80% 60% at 15% 95%, rgba(110,231,183,0.22) 0%, transparent 70%)",
    accent: "#6EE7B7",
    numberFg: "#D1FAE5",
    stripe: "#34D399",
    shadow: "rgba(52,211,153,0.22)",
  },
  neutral: {
    bgGradient:
      "radial-gradient(120% 95% at 85% 10%, rgba(129,140,248,0.4) 0%, #1E1B4B 55%, #0F0D2E 100%)",
    glowGradient:
      "radial-gradient(80% 60% at 15% 95%, rgba(165,180,252,0.22) 0%, transparent 70%)",
    accent: "#A5B4FC",
    numberFg: "#DBEAFE",
    stripe: "#818CF8",
    shadow: "rgba(129,140,248,0.22)",
  },
  challenging: {
    bgGradient:
      "radial-gradient(120% 95% at 85% 10%, rgba(251,113,133,0.4) 0%, #881337 55%, #500724 100%)",
    glowGradient:
      "radial-gradient(80% 60% at 15% 95%, rgba(253,164,175,0.2) 0%, transparent 70%)",
    accent: "#FDA4AF",
    numberFg: "#FECDD3",
    stripe: "#FB7185",
    shadow: "rgba(251,113,133,0.2)",
  },
};

function sentenceCase(s: string): string {
  if (!s) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function ThemeGallery({
  themes,
  onTap,
  replayKey = 0,
}: {
  themes: GalleryTheme[];
  onTap?: (id: string) => void;
  replayKey?: number | string;
}) {
  const { hero, midRow, gridCards, rest } = useMemo(() => {
    return {
      hero: themes[0] ?? null,
      midRow: themes.slice(1, 3),
      gridCards: themes.slice(3, 7),
      rest: themes.slice(7),
    };
  }, [themes]);

  if (!hero) return null;

  return (
    <div className="mt-1">
      <HeroCard
        theme={hero}
        index={0}
        replayKey={replayKey}
        onTap={onTap}
      />

      {midRow.length > 0 && (
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          {midRow.map((t, i) => (
            <MidCard
              key={`${t.id}-${replayKey}`}
              theme={t}
              index={i + 1}
              replayKey={replayKey}
              onTap={onTap}
            />
          ))}
        </div>
      )}

      {gridCards.length > 0 && (
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          {gridCards.map((t, i) => (
            <SmallCard
              key={`${t.id}-${replayKey}`}
              theme={t}
              index={i + 3}
              replayKey={replayKey}
              onTap={onTap}
            />
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <div className="mt-5 flex flex-col gap-2">
          {rest.map((t, i) => (
            <StripRow
              key={`${t.id}-${replayKey}`}
              theme={t}
              index={i + 7}
              replayKey={replayKey}
              onTap={onTap}
            />
          ))}
        </div>
      )}

      <style>{`
        @keyframes gallery-enter {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function entryStyle(index: number): React.CSSProperties {
  const delay = Math.min(index * 45, 520);
  return {
    animation: `gallery-enter 360ms cubic-bezier(0.22,1,0.36,1) ${delay}ms both`,
  };
}

function HeroCard({
  theme,
  index,
  replayKey,
  onTap,
}: {
  theme: GalleryTheme;
  index: number;
  replayKey: number | string;
  onTap?: (id: string) => void;
}) {
  const tone = TONE[theme.tone];
  return (
    <button
      type="button"
      key={`${theme.id}-${replayKey}`}
      onClick={() => onTap?.(theme.id)}
      className="relative block w-full overflow-hidden rounded-3xl border text-left transition-transform hover:scale-[1.005] active:scale-[0.995]"
      style={{
        height: 210,
        borderColor: "rgba(255,255,255,0.08)",
        background: tone.bgGradient,
        boxShadow: `0 12px 32px -6px ${tone.shadow}`,
        ...entryStyle(index),
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: tone.glowGradient }}
      />
      <div className="relative flex h-full flex-col justify-between p-6">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{
              backgroundColor: tone.accent,
              boxShadow: `0 0 8px ${tone.accent}`,
            }}
          />
          <span
            className="uppercase"
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "1.6px",
              color: tone.accent,
            }}
          >
            Top theme
          </span>
        </div>
        <div>
          <h2
            className="text-white"
            style={{
              fontSize: 40,
              fontWeight: 700,
              letterSpacing: "-0.8px",
              lineHeight: 1.1,
            }}
          >
            {sentenceCase(theme.name)}
          </h2>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span
              style={{
                fontSize: 32,
                fontWeight: 700,
                letterSpacing: "-1px",
                color: tone.numberFg,
              }}
            >
              {theme.mentionCount}
            </span>
            <span
              className="uppercase text-white/60"
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "1.2px",
              }}
            >
              {theme.mentionCount === 1 ? "Mention" : "Mentions"}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function MidCard({
  theme,
  index,
  replayKey,
  onTap,
}: {
  theme: GalleryTheme;
  index: number;
  replayKey: number | string;
  onTap?: (id: string) => void;
}) {
  const tone = TONE[theme.tone];
  return (
    <button
      type="button"
      key={`${theme.id}-${replayKey}`}
      onClick={() => onTap?.(theme.id)}
      className="relative block w-full overflow-hidden rounded-2xl border text-left transition-transform hover:scale-[1.01] active:scale-[0.99]"
      style={{
        height: 150,
        borderColor: "rgba(255,255,255,0.06)",
        background: tone.bgGradient,
        ...entryStyle(index),
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: tone.glowGradient }}
      />
      <div className="relative flex h-full flex-col justify-between p-4">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: tone.accent }}
        />
        <div>
          <h3
            className="text-white"
            style={{
              fontSize: 19,
              fontWeight: 700,
              letterSpacing: "-0.3px",
              lineHeight: 1.2,
            }}
          >
            {sentenceCase(theme.name)}
          </h3>
          <p
            className="mt-1 text-white/65"
            style={{
              fontSize: 11,
              letterSpacing: "0.6px",
              fontWeight: 500,
            }}
          >
            {theme.mentionCount} mentions
          </p>
        </div>
      </div>
    </button>
  );
}

function SmallCard({
  theme,
  index,
  replayKey,
  onTap,
}: {
  theme: GalleryTheme;
  index: number;
  replayKey: number | string;
  onTap?: (id: string) => void;
}) {
  const tone = TONE[theme.tone];
  return (
    <button
      type="button"
      key={`${theme.id}-${replayKey}`}
      onClick={() => onTap?.(theme.id)}
      className="relative block w-full overflow-hidden rounded-2xl border text-left transition-transform hover:scale-[1.01] active:scale-[0.99]"
      style={{
        height: 110,
        borderColor: "rgba(255,255,255,0.05)",
        background: tone.bgGradient,
        ...entryStyle(index),
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: tone.glowGradient }}
      />
      <div className="relative flex h-full flex-col justify-between p-3.5">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: tone.accent }}
        />
        <div>
          <h4
            className="text-white"
            style={{
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: "-0.2px",
            }}
          >
            {sentenceCase(theme.name)}
          </h4>
          <p
            className="mt-0.5 text-white/55"
            style={{
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            {theme.mentionCount} mentions
          </p>
        </div>
      </div>
    </button>
  );
}

function StripRow({
  theme,
  index,
  replayKey,
  onTap,
}: {
  theme: GalleryTheme;
  index: number;
  replayKey: number | string;
  onTap?: (id: string) => void;
}) {
  const tone = TONE[theme.tone];
  return (
    <button
      type="button"
      key={`${theme.id}-${replayKey}`}
      onClick={() => onTap?.(theme.id)}
      className="relative flex w-full items-center overflow-hidden rounded-2xl border py-3.5 pl-5 pr-4 text-left transition-colors"
      style={{
        borderColor: "rgba(255,255,255,0.04)",
        background: "rgba(30,27,75,0.35)",
        ...entryStyle(index),
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
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: "-0.1px",
        }}
      >
        {sentenceCase(theme.name)}
      </span>
      <span
        style={{
          fontSize: 16,
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
