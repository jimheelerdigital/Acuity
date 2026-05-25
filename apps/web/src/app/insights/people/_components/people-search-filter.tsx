"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Client-side filter for the people directory. Wraps the server-
 * rendered row Links and hides any whose data-name attribute doesn't
 * include the query. Slice 4 v1.2 Anchor People.
 *
 * Keeping the filter purely DOM-driven (toggle `display: none` on
 * descendants matching `.acuity-people-row`) means we don't pay the
 * cost of re-rendering 200 Link/Card components per keystroke, and
 * the search box stays snappy even on the heaviest accounts.
 */

export function PeopleSearchFilter({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const norm = query.trim().toLowerCase();
    const rows = root.querySelectorAll<HTMLElement>(".acuity-people-row");
    rows.forEach((row) => {
      const name = row.dataset.name ?? "";
      const match = norm.length === 0 || name.includes(norm);
      row.style.display = match ? "" : "none";
    });
  }, [query]);

  return (
    <div>
      <div className="mb-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name…"
          className="w-full rounded-acuity-lg border border-acuity-card-border bg-acuity-card-bg px-4 py-2.5 text-[14px] text-acuity-text placeholder:text-acuity-text-ter focus:outline-none focus:ring-1 focus:ring-acuity-text-ter"
        />
      </div>
      <div ref={containerRef} className="space-y-2">
        {children}
      </div>
    </div>
  );
}
