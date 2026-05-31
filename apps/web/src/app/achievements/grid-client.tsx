"use client";

/**
 * Interactive achievements grid + detail panel. Server page (./page.tsx)
 * fetches the catalog + the user's earned rows and passes them in
 * already-shaped. This component owns selection state + the
 * detail-side-panel UI.
 *
 * Page chrome (PageContainer + AppShell wrapper) matches the rest of
 * the authenticated app — same sidebar, same DesktopTopbar, same
 * mobile-width rules as /goals, /insights, etc.
 */

import { useMemo, useState } from "react";

import { PageContainer } from "@/components/page-container";

export type CatalogItem = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: "CONSISTENCY" | "REFLECTION" | "MOMENT";
  tier: number;
  points: number;
  earned: boolean;
  earnedAt: string | null;
  pointsAwarded: number | null;
};

const SECTIONS: Array<{
  key: CatalogItem["category"];
  title: string;
  blurb: string;
}> = [
  {
    key: "CONSISTENCY",
    title: "Consistency",
    blurb: "Streaks, milestones, and showing up.",
  },
  {
    key: "REFLECTION",
    title: "Reflection",
    blurb: "Depth, patterns, and growth.",
  },
  {
    key: "MOMENT",
    title: "Moment",
    blurb: "Special and surprising one-offs.",
  },
];

const TIER_LABEL: Record<number, string> = {
  1: "Bronze",
  2: "Silver",
  3: "Gold",
  4: "Platinum",
  5: "Diamond",
};

export function AchievementsGrid({
  items,
  totals,
}: {
  items: CatalogItem[];
  totals: { earned: number; total: number; points: number };
}) {
  const [selected, setSelected] = useState<CatalogItem | null>(null);

  const grouped = useMemo(() => {
    return SECTIONS.map((s) => ({
      ...s,
      items: items.filter((i) => i.category === s.key),
    })).filter((s) => s.items.length > 0);
  }, [items]);

  return (
    <PageContainer>
      <header className="mb-10 pt-6 lg:pt-10">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[1.6px] text-acuity-text-ter">
          Achievements — Lifetime
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-acuity-text">
          {totals.points} pts
        </h1>
        <p className="mt-1 text-sm text-acuity-text-sec">
          {totals.earned} of {totals.total} earned
        </p>
      </header>

      {grouped.map((section) => (
        <section key={section.key} className="mb-12">
          <div className="mb-5">
            <h2 className="font-mono text-[10px] font-bold uppercase tracking-[1.6px] text-acuity-text-ter">
              {section.title}
            </h2>
            <p className="mt-1 text-sm text-acuity-text-sec">{section.blurb}</p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {section.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item)}
                className="group flex flex-col items-center rounded-2xl border border-acuity-line bg-acuity-bg-sub p-4 text-left transition hover:border-acuity-primary/40 hover:bg-acuity-bg-sub/70"
                aria-label={item.title}
              >
                <img
                  src={`/badges/badge_${item.slug}_${item.earned ? "earned" : "locked"}.svg`}
                  alt=""
                  width={96}
                  height={96}
                  className="mb-3"
                />
                <p
                  className={`text-center text-sm font-semibold ${
                    item.earned ? "text-acuity-text" : "text-acuity-text-ter"
                  }`}
                >
                  {item.title}
                </p>
              </button>
            ))}
          </div>
        </section>
      ))}

      {/* Side-panel detail */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <aside
            className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-acuity-bg-sub p-8"
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="mb-6 text-sm text-acuity-text-ter hover:text-acuity-text"
            >
              ← Close
            </button>
            <div className="flex flex-col items-center text-center">
              <img
                src={`/badges/badge_${selected.slug}_${selected.earned ? "earned" : "locked"}.svg`}
                alt=""
                width={160}
                height={160}
                className="mb-6"
              />
              <h3 className="text-2xl font-bold text-acuity-text">
                {selected.title}
              </h3>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-acuity-text-sec">
                {selected.description}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Chip
                  text={selected.earned ? "Earned" : "Locked"}
                  variant={selected.earned ? "good" : "muted"}
                />
                <Chip
                  text={TIER_LABEL[selected.tier] ?? `Tier ${selected.tier}`}
                  variant="brand"
                />
                <Chip
                  text={`${selected.pointsAwarded ?? selected.points} pts`}
                  variant="muted"
                />
              </div>
              {selected.earned && selected.earnedAt && (
                <p className="mt-4 font-mono text-[11px] uppercase tracking-[1.2px] text-acuity-text-ter">
                  Earned {new Date(selected.earnedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </aside>
        </div>
      )}
    </PageContainer>
  );
}

function Chip({
  text,
  variant,
}: {
  text: string;
  variant: "good" | "muted" | "brand";
}) {
  const palette = {
    good: "bg-emerald-500/15 text-emerald-300",
    muted: "bg-acuity-bg-inset text-acuity-text-sec",
    brand: "bg-acuity-primary/15 text-acuity-primary",
  }[variant];
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${palette}`}
    >
      {text}
    </span>
  );
}
