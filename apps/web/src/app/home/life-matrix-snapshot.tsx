import Link from "next/link";

import { DEFAULT_LIFE_AREAS } from "@acuity/shared";

/**
 * Compact 6-spoke radial summary of the user's Life Matrix dimensions.
 * Lives on /home as widget #4 of the dashboard redesign and links
 * through to the full /life-matrix page.
 *
 * Visual continuity: the radial geometry mirrors the LifeMap radar on
 * /life-matrix (same 6 dimensions, same canonical colors per area,
 * same enum order). Stripped down for compactness — no axis labels,
 * no historical overlay, no detail modal.
 *
 * Empty state contract:
 *   - `entryCount < 5` → render "unlock" placeholder ring with
 *     progress text. The 5-entry threshold matches the Life Matrix
 *     unlock rule in `entitlements.ts`.
 *   - Otherwise → real polygon based on `areas[].score` (0-10 scale).
 *
 * Server component — caller passes pre-fetched `areas` so we don't
 * trigger a second `/api/lifemap` round-trip from the dashboard.
 */

export type SnapshotArea = {
  area: string; // canonical enum (CAREER, HEALTH, etc.)
  score: number; // 0-10
};

const SIZE = 240;
const CENTER = SIZE / 2;
const RADIUS = 88;
const RING_LEVELS = [0.33, 0.66, 1];

function polarToCartesian(
  index: number,
  total: number,
  fraction: number
): { x: number; y: number } {
  // Start at top (12 o'clock), distribute clockwise.
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  return {
    x: CENTER + Math.cos(angle) * RADIUS * fraction,
    y: CENTER + Math.sin(angle) * RADIUS * fraction,
  };
}

export function LifeMatrixSnapshot({
  areas,
  entryCount,
  unlocked,
}: {
  areas: SnapshotArea[];
  entryCount: number;
  /** Whether the lifeMatrix progression gate is open. When false, we
   *  render the empty state regardless of entry count, since the
   *  user's scores haven't been computed yet. */
  unlocked: boolean;
}) {
  const ENTRIES_REQUIRED = 5;
  const isEmpty = !unlocked || entryCount < ENTRIES_REQUIRED;

  // Map incoming areas onto the canonical 6-area order so a missing
  // row (newer accounts may have fewer rows seeded) renders as a
  // flat 0 instead of a hole in the polygon.
  const scoresByEnum = new Map(
    areas.map((a) => [a.area.toUpperCase(), a.score])
  );
  const ordered = DEFAULT_LIFE_AREAS.map((a) => ({
    enum: a.enum,
    name: a.name,
    color: a.color,
    score: scoresByEnum.get(a.enum) ?? 0,
  }));

  // Polygon path: x,y pairs for each dimension, score normalized to
  // 0-1. Clamped on BOTH ends:
  //   - lower bound 0.05 so a zero-score vertex is visible just off
  //     the center dot rather than collapsed behind it
  //   - upper bound 1.0 so any out-of-range data (e.g. a row where
  //     score is on the 0-100 scale by mistake) still renders inside
  //     the radar circle instead of projecting off-canvas
  const polygonPoints = ordered
    .map((a, i) => {
      const fraction = isEmpty
        ? 0.45
        : Math.min(1, Math.max(0.05, a.score / 10));
      const { x, y } = polarToCartesian(i, ordered.length, fraction);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#1E1E2E]">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Life Matrix
          </h2>
          <p className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {isEmpty
              ? "Your life, scoring up"
              : "Where you are right now"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col items-center gap-5 lg:flex-row lg:items-center lg:gap-7">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width={SIZE}
          height={SIZE}
          className="shrink-0"
          aria-hidden="true"
        >
          {/* Concentric guide rings — three at 33%/66%/100% radius. */}
          {RING_LEVELS.map((level) => (
            <circle
              key={level}
              cx={CENTER}
              cy={CENTER}
              r={RADIUS * level}
              fill="none"
              stroke="rgba(161,161,170,0.18)"
              strokeWidth={1}
              strokeDasharray={level === 1 ? undefined : "2 4"}
            />
          ))}

          {/* Spokes from center to each dimension's outer point. */}
          {ordered.map((a, i) => {
            const { x, y } = polarToCartesian(i, ordered.length, 1);
            return (
              <line
                key={a.enum}
                x1={CENTER}
                y1={CENTER}
                x2={x}
                y2={y}
                stroke="rgba(161,161,170,0.14)"
                strokeWidth={1}
              />
            );
          })}

          {/* The user's score polygon — filled violet at low opacity,
              stroked at full. In empty state the polygon is a flat
              circle at 45% radius so it reads as "scaffolding waiting
              for data" rather than "you scored a 4 across the board". */}
          <polygon
            points={polygonPoints}
            fill={isEmpty ? "rgba(167,139,250,0.10)" : "rgba(124,58,237,0.18)"}
            stroke={isEmpty ? "rgba(167,139,250,0.40)" : "#7C3AED"}
            strokeWidth={isEmpty ? 1 : 2}
            strokeDasharray={isEmpty ? "4 4" : undefined}
          />

          {/* Vertex dots colored by canonical life-area color so the
              user can identify which spoke is Career vs Health, etc.
              Hidden in empty state — would suggest data exists. */}
          {!isEmpty &&
            ordered.map((a, i) => {
              const fraction = Math.min(1, Math.max(0.05, a.score / 10));
              const { x, y } = polarToCartesian(i, ordered.length, fraction);
              return (
                <circle
                  key={a.enum}
                  cx={x}
                  cy={y}
                  r={4}
                  fill={a.color}
                  stroke="white"
                  strokeWidth={1.5}
                  className="dark:[stroke:#1E1E2E]"
                />
              );
            })}
        </svg>

        <div className="flex-1">
          {isEmpty ? (
            <div>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                Your six life areas — career, health, relationships,
                finances, personal growth, other — get a score as
                Acuity sees signal across your debriefs.
              </p>
              <div className="mt-4 flex items-center gap-3">
                <div className="h-1.5 flex-1 rounded-full bg-zinc-100 dark:bg-white/10">
                  <div
                    className="h-1.5 rounded-full bg-violet-500"
                    style={{
                      width: `${Math.min(100, (entryCount / ENTRIES_REQUIRED) * 100)}%`,
                    }}
                  />
                </div>
                <span className="text-xs font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
                  {entryCount} / {ENTRIES_REQUIRED}
                </span>
              </div>
              <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
                {ENTRIES_REQUIRED - entryCount === 1
                  ? "1 more entry to unlock."
                  : `${Math.max(0, ENTRIES_REQUIRED - entryCount)} more entries to unlock.`}
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-x-5 gap-y-1.5">
              {ordered.map((a) => (
                <li
                  key={a.enum}
                  className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300"
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: a.color }}
                  />
                  <span className="flex-1 truncate">{a.name}</span>
                  <span className="font-medium tabular-nums text-zinc-700 dark:text-zinc-200">
                    {Math.round(a.score * 10)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-5 border-t border-zinc-100 pt-4 dark:border-white/5">
        <Link
          href="/life-matrix"
          className="inline-flex items-center gap-1 text-sm font-semibold text-violet-600 transition hover:text-violet-500 dark:text-violet-400"
        >
          See full Life Matrix
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
            <path d="M9 18l6-6-6-6" />
          </svg>
        </Link>
      </div>
    </section>
  );
}
