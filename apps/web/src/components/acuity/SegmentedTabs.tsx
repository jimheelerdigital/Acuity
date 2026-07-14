"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Ripple SegmentedTabs — web mirror of `apps/mobile/components/acuity/
 * SegmentedTabs.tsx`. Per DESIGN_SYSTEM.md §5.6.
 *
 * Pill-shaped horizontal tab strip with a gradMix indicator that slides
 * between segments on selection. Indicator translateX + width
 * transition both run on the canonical 280ms easeStandard curve.
 * Active segment text flips to white; inactive stays at textTer.
 *
 * Use cases:
 *   - Insights tabs (Theme Map | Matrix | Trends)
 *   - Tasks tabs (Today | Upcoming | Done)
 *   - Goals tabs (Active | Done | Dormant)
 *   - Life Matrix time-range chips (Week | Month | All time)
 *
 * Layout is measured on mount + ref change so the indicator matches
 * actual rendered widths (label lengths vary).
 */

export interface SegmentedTabsProps<TId extends string = string> {
  tabs: { id: TId; label: string }[];
  activeId: TId;
  onChange: (id: TId) => void;
  className?: string;
}

export function SegmentedTabs<TId extends string>({
  tabs,
  activeId,
  onChange,
  className = "",
}: SegmentedTabsProps<TId>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Map<TId, HTMLButtonElement | null>>(new Map());
  const [indicator, setIndicator] = useState<{ x: number; w: number }>({
    x: 0,
    w: 0,
  });

  // Measure on mount + whenever activeId changes. useLayoutEffect so
  // the indicator lands in place before paint instead of a one-frame
  // flicker at 0px width.
  useLayoutEffect(() => {
    const btn = tabRefs.current.get(activeId);
    const container = containerRef.current;
    if (!btn || !container) return;
    const containerRect = container.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setIndicator({
      x: btnRect.left - containerRect.left,
      w: btnRect.width,
    });
  }, [activeId, tabs.length]);

  // Re-measure on resize so the indicator stays aligned.
  useEffect(() => {
    const handler = () => {
      const btn = tabRefs.current.get(activeId);
      const container = containerRef.current;
      if (!btn || !container) return;
      const containerRect = container.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      setIndicator({
        x: btnRect.left - containerRect.left,
        w: btnRect.width,
      });
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [activeId]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      className={`relative inline-flex items-center rounded-acuity-pill bg-acuity-bg-inset p-[3px] ${className}`}
    >
      {/* Sliding gradient indicator */}
      <div
        aria-hidden="true"
        className="absolute inset-y-[3px] left-0 rounded-acuity-pill bg-acuity-grad-mix transition-[transform,width] duration-acuity-base ease-acuity-standard"
        style={{
          transform: `translateX(${indicator.x}px)`,
          width: indicator.w,
        }}
      />
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current.set(tab.id, el);
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`relative flex-1 rounded-acuity-pill px-4 py-2 text-[13px] font-semibold tracking-[-0.1px] transition-colors duration-acuity-base ease-acuity-standard ${
              isActive ? "text-white" : "text-acuity-text-ter"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
