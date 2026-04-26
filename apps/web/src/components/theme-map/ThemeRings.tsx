"use client";

import { useEffect, useState } from "react";

/**
 * Hero rings card — three concentric rings (today / week / month) with
 * a pulsing centre, a "what stood out" narrative on the right, and
 * dashed wayfinding leader lines.
 *
 * 360×360 viewBox. Each ring is rendered TWICE — once with a Gaussian
 * blur for halo, once crisp on top — so the gradients read as light.
 *
 * dasharray math: stroke-dasharray="<filled> <gap>" where
 *   filled = (count / target) * circumference, capped at full circle.
 * Targets are sensibly bounded:
 *   - inner (today):  max(8, todayCount * 1.5)
 *   - middle (week):  max(20, weekCount * 1.25)
 *   - outer (month):  max(40, monthCount * 1.1)
 *
 * Rings start at 12 o'clock via rotate(-90).
 */

export type ThemePeriods = {
  today: { count: number; mood: number };
  week: { count: number; mood: number };
  month: { count: number; mood: number };
};

export function ThemeRings({
  periods,
  topThemeName,
  totalMentions,
}: {
  periods: ThemePeriods;
  topThemeName: string;
  totalMentions: number;
}) {
  // Animate dasharray from 0 → target on mount.
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const duration = 800;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // cubic-bezier(0.2, 0.8, 0.2, 1) approximation
      const eased = 1 - Math.pow(1 - t, 3);
      setProgress(eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [periods.today.count, periods.week.count, periods.month.count]);

  const TARGET_TODAY = Math.max(8, periods.today.count * 1.5);
  const TARGET_WEEK = Math.max(20, periods.week.count * 1.25);
  const TARGET_MONTH = Math.max(40, periods.month.count * 1.1);

  const ringSpec = [
    {
      r: 80,
      strokeWidth: 22,
      gradientId: "today-gradient",
      stops: [
        { offset: "0%", color: "#FB923C" },
        { offset: "55%", color: "#FBBF24" },
        { offset: "100%", color: "#FDE68A" },
      ],
      trackColor: "rgba(251,146,60,0.18)",
      glowColor: "#FB923C",
      label: "TODAY",
      count: periods.today.count,
      target: TARGET_TODAY,
    },
    {
      r: 120,
      strokeWidth: 18,
      gradientId: "week-gradient",
      stops: [
        { offset: "0%", color: "#A78BFA" },
        { offset: "55%", color: "#8B5CF6" },
        { offset: "100%", color: "#60A5FA" },
      ],
      trackColor: "rgba(139,92,246,0.18)",
      glowColor: "#8B5CF6",
      label: "WEEK",
      count: periods.week.count,
      target: TARGET_WEEK,
    },
    {
      r: 156,
      strokeWidth: 14,
      gradientId: "month-gradient",
      stops: [
        { offset: "0%", color: "#22D3EE" },
        { offset: "100%", color: "#A78BFA" },
      ],
      trackColor: "rgba(34,211,238,0.18)",
      glowColor: "#22D3EE",
      label: "MONTH",
      count: periods.month.count,
      target: TARGET_MONTH,
    },
  ];

  return (
    <div
      className="relative grid grid-cols-1 gap-6 rounded-2xl p-6 sm:grid-cols-[360px_1fr] sm:items-center sm:gap-8 sm:p-7"
      style={{
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.005) 100%)",
        border: "0.5px solid rgba(255,255,255,0.08)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.06), 0 24px 60px -36px rgba(0,0,0,0.6)",
      }}
    >
      <div className="relative mx-auto" style={{ width: 360, height: 360 }}>
        {/* background pulsing glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle, rgba(251,146,60,0.32) 0%, rgba(251,146,60,0.08) 30%, transparent 60%)",
            filter: "blur(40px)",
            animation: "rings-pulse 4s ease-in-out infinite",
          }}
        />
        <svg width={360} height={360} viewBox="0 0 360 360" style={{ overflow: "visible" }}>
          <defs>
            {ringSpec.map((spec) => (
              <linearGradient
                key={spec.gradientId}
                id={spec.gradientId}
                x1="0"
                y1="0"
                x2="1"
                y2="1"
              >
                {spec.stops.map((s) => (
                  <stop key={s.offset} offset={s.offset} stopColor={s.color} />
                ))}
              </linearGradient>
            ))}
            <filter id="rings-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
            <radialGradient id="rings-bg-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FB923C" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#FB923C" stopOpacity={0} />
            </radialGradient>
          </defs>

          {/* radial bg-glow at r=170 */}
          <circle cx={180} cy={180} r={170} fill="url(#rings-bg-glow)" />

          {/* tracks (faint) — render all THREE first so progress arcs sit on top */}
          {ringSpec.map((spec) => (
            <circle
              key={`track-${spec.gradientId}`}
              cx={180}
              cy={180}
              r={spec.r}
              fill="none"
              stroke={spec.trackColor}
              strokeWidth={spec.strokeWidth}
            />
          ))}

          {/* glow underlayer + crisp top — for each ring */}
          {ringSpec.map((spec) => {
            const circumference = 2 * Math.PI * spec.r;
            const filled =
              Math.min(1, spec.count / spec.target) * circumference * progress;
            const dasharray = `${filled} ${circumference - filled}`;
            return (
              <g key={`arc-${spec.gradientId}`}>
                <circle
                  cx={180}
                  cy={180}
                  r={spec.r}
                  fill="none"
                  stroke={`url(#${spec.gradientId})`}
                  strokeWidth={spec.strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={dasharray}
                  transform="rotate(-90 180 180)"
                  filter="url(#rings-glow)"
                  opacity={0.75}
                />
                <circle
                  cx={180}
                  cy={180}
                  r={spec.r}
                  fill="none"
                  stroke={`url(#${spec.gradientId})`}
                  strokeWidth={spec.strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={dasharray}
                  transform="rotate(-90 180 180)"
                />
              </g>
            );
          })}

          {/* dashed wayfinding leader lines */}
          {/* MONTH leader — top-left */}
          <g opacity={0.55}>
            <line
              x1={50}
              y1={40}
              x2={148}
              y2={68}
              stroke="rgba(34,211,238,0.5)"
              strokeWidth={0.8}
              strokeDasharray="3 4"
            />
            <text
              x={20}
              y={36}
              fontSize={11}
              fontWeight={500}
              letterSpacing={1.8}
              fill="#22D3EE"
            >
              MONTH
            </text>
          </g>
          {/* WEEK leader — top-right */}
          <g opacity={0.55}>
            <line
              x1={310}
              y1={50}
              x2={224}
              y2={88}
              stroke="rgba(139,92,246,0.5)"
              strokeWidth={0.8}
              strokeDasharray="3 4"
            />
            <text
              x={302}
              y={46}
              fontSize={11}
              fontWeight={500}
              letterSpacing={1.8}
              fill="#A78BFA"
            >
              WEEK
            </text>
          </g>
        </svg>

        {/* centre content (HTML overlay so text is selectable + crisp) */}
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          style={{ animation: "rings-pulse-num 4s ease-in-out infinite" }}
        >
          <span
            style={{
              fontSize: 11,
              letterSpacing: 1.8,
              fontWeight: 500,
              color: "#FCA85A",
              textTransform: "uppercase",
            }}
          >
            TODAY · {topThemeName.toUpperCase()}
          </span>
          <span
            style={{
              fontSize: 56,
              fontWeight: 500,
              color: "#FAFAFA",
              letterSpacing: -2,
              lineHeight: 1,
              marginTop: 4,
              textShadow: "0 0 24px rgba(251,146,60,0.6)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {periods.today.count}
          </span>
          <span
            style={{
              fontSize: 12,
              marginTop: 6,
              color: "rgba(168,168,180,0.8)",
            }}
          >
            mentions so far
          </span>
        </div>
      </div>

      <NarrativeColumn
        topThemeName={topThemeName}
        periods={periods}
        totalMentions={totalMentions}
      />

      <style jsx>{`
        @keyframes rings-pulse {
          0%, 100% { opacity: 0.85; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.04); }
        }
        @keyframes rings-pulse-num {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
      `}</style>
    </div>
  );
}

function NarrativeColumn({
  topThemeName,
  periods,
  totalMentions,
}: {
  topThemeName: string;
  periods: ThemePeriods;
  totalMentions: number;
}) {
  const headline = buildHeadline(topThemeName, periods, totalMentions);
  return (
    <div className="min-w-0">
      <p
        className="uppercase"
        style={{
          fontSize: 12,
          letterSpacing: 2,
          fontWeight: 700,
          color: "#FCA85A",
        }}
      >
        What stood out
      </p>
      <h2
        className="mt-2"
        style={{
          fontSize: 24,
          fontWeight: 500,
          letterSpacing: -0.3,
          lineHeight: 1.3,
          color: "#FAFAFA",
        }}
      >
        <span style={{ fontWeight: 600 }}>{capitalize(topThemeName)}</span>{" "}
        {headline}
      </h2>
      <div
        className="mt-5 grid grid-cols-3 gap-3"
        style={{ borderTop: "0.5px solid rgba(255,255,255,0.06)", paddingTop: 16 }}
      >
        <PeriodStat label="TODAY" count={periods.today.count} dot="#FB923C" />
        <PeriodStat label="THIS WEEK" count={periods.week.count} dot="#A78BFA" />
        <PeriodStat label="THIS MONTH" count={periods.month.count} dot="#22D3EE" />
      </div>
    </div>
  );
}

function PeriodStat({
  label,
  count,
  dot,
}: {
  label: string;
  count: number;
  dot: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: 9999,
            background: dot,
            boxShadow: `0 0 8px ${dot}, 0 0 14px ${dot}66`,
          }}
        />
        <span
          style={{
            fontSize: 12,
            letterSpacing: 1.6,
            fontWeight: 700,
            color: "rgba(168,168,180,0.7)",
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: -0.5,
          color: "#FAFAFA",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {count}
      </div>
    </div>
  );
}

function buildHeadline(
  _themeName: string,
  periods: ThemePeriods,
  totalMentions: number
): React.ReactNode {
  const today = periods.today.count;
  const week = periods.week.count;
  const month = periods.month.count;

  // Today-driven headline when there's activity today.
  if (today > 0) {
    if (week > today && week > 0) {
      const pct = Math.round((today / week) * 100);
      return (
        <>
          <span style={gradientText()}>
            came up {today} {today === 1 ? "time" : "times"} today
          </span>
          {" — "}already {pct}% of this week&rsquo;s count.
        </>
      );
    }
    return (
      <>
        <span style={gradientText()}>
          came up {today} {today === 1 ? "time" : "times"} today
        </span>
        .
      </>
    );
  }

  // No-today fallback: month framing.
  if (month > 0) {
    const pct =
      totalMentions > 0 ? Math.round((month / totalMentions) * 100) : 0;
    return (
      <>
        <span style={gradientText()}>
          came up {month} {month === 1 ? "time" : "times"} this month
        </span>
        {pct > 0 ? ` — ${pct}% of all your themes.` : "."}
      </>
    );
  }

  return "is your most-mentioned recurring thread.";
}

function gradientText(): React.CSSProperties {
  return {
    background:
      "linear-gradient(90deg, #FCA85A 0%, #FB923C 50%, #F472B6 100%)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
    color: "transparent",
    fontWeight: 600,
  };
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
