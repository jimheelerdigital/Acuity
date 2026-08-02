"use client";

import { useMemo, useState } from "react";

/**
 * Shared interactive admin table. Click-to-sort headers, optional text
 * search, client-side pagination, sticky header, row hover + click.
 *
 * Rows are plain objects; columns describe how to render them. Sorting
 * uses `sortValue` when provided (e.g. for formatted dates/currency),
 * otherwise the raw field value. All styling reads Ripple/Acuity
 * tokens — no hardcoded hex.
 */

export interface Column<Row> {
  key: string;
  label: string;
  /** Extract raw value for default rendering + sorting */
  value: (row: Row) => string | number | null | undefined;
  /** Custom cell renderer (falls back to String(value)) */
  render?: (row: Row) => React.ReactNode;
  /** Sort on a different value than displayed (dates, cents, etc.) */
  sortValue?: (row: Row) => string | number | null | undefined;
  sortable?: boolean; // default true
  align?: "left" | "right";
  /** Numeric column — renders mono + tabular-nums */
  numeric?: boolean;
  width?: number | string;
}

interface Props<Row> {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Enable the search box; matches against these columns' values */
  searchable?: boolean;
  searchPlaceholder?: string;
  initialSort?: { key: string; dir: "asc" | "desc" };
  pageSize?: number; // 0 = no pagination
  onRowClick?: (row: Row) => void;
  emptyMessage?: string;
  /** Max height with sticky header (e.g. 480). Unset = natural height */
  maxHeight?: number;
}

export default function DataTable<Row>({
  columns,
  rows,
  rowKey,
  searchable,
  searchPlaceholder = "Search…",
  initialSort,
  pageSize = 0,
  onRowClick,
  emptyMessage = "No data",
  maxHeight,
}: Props<Row>) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(
    initialSort ?? null
  );
  const [page, setPage] = useState(0);

  const handleSort = (col: Column<Row>) => {
    if (col.sortable === false) return;
    setPage(0);
    setSort((prev) =>
      prev?.key === col.key
        ? { key: col.key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key: col.key, dir: "desc" }
    );
  };

  const processed = useMemo(() => {
    let out = rows;

    if (searchable && query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter((row) =>
        columns.some((c) =>
          String(c.value(row) ?? "")
            .toLowerCase()
            .includes(q)
        )
      );
    }

    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        const getVal = col.sortValue ?? col.value;
        const dir = sort.dir === "asc" ? 1 : -1;
        out = [...out].sort((a, b) => {
          const va = getVal(a);
          const vb = getVal(b);
          if (va == null && vb == null) return 0;
          if (va == null) return 1; // nulls last
          if (vb == null) return -1;
          if (typeof va === "number" && typeof vb === "number")
            return (va - vb) * dir;
          return String(va).localeCompare(String(vb)) * dir;
        });
      }
    }

    return out;
  }, [rows, columns, query, sort, searchable]);

  const pageCount = pageSize > 0 ? Math.ceil(processed.length / pageSize) : 1;
  const clampedPage = Math.min(page, Math.max(0, pageCount - 1));
  const visible =
    pageSize > 0
      ? processed.slice(clampedPage * pageSize, (clampedPage + 1) * pageSize)
      : processed;

  return (
    <div>
      {searchable && (
        <div className="mb-3">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder={searchPlaceholder}
            className="w-full max-w-xs rounded-acuity-sm bg-acuity-bg-inset px-3.5 py-2.5 text-[14px] text-acuity-text placeholder:text-acuity-text-quiet focus:outline-none focus:ring-1 focus:ring-acuity-primary sm:w-64"
          />
        </div>
      )}

      <div
        className="overflow-x-auto"
        style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
      >
        <table className="w-full text-left text-sm">
          <thead className={maxHeight ? "sticky top-0 z-10" : undefined}>
            <tr className="border-b border-acuity-line-strong bg-acuity-card-bg">
              {columns.map((col) => {
                const active = sort?.key === col.key;
                const sortable = col.sortable !== false;
                return (
                  <th
                    key={col.key}
                    style={{ width: col.width }}
                    className={`whitespace-nowrap pb-2.5 pr-4 pt-1 font-mono text-[10px] font-bold uppercase tracking-[1.4px] ${
                      col.align === "right" ? "text-right" : ""
                    } ${active ? "text-acuity-primary" : "text-acuity-text-ter"}`}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col)}
                        className={`inline-flex items-center gap-1 uppercase tracking-[1.4px] transition hover:text-acuity-text-sec ${
                          active ? "text-acuity-primary" : ""
                        }`}
                      >
                        {col.label}
                        <span className="text-[9px]">
                          {active ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-10 text-center text-acuity-text-ter"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-b border-acuity-line transition ${
                    onRowClick
                      ? "cursor-pointer hover:bg-acuity-bg-sub"
                      : "hover:bg-acuity-bg-sub"
                  }`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`py-2.5 pr-4 text-acuity-text-sec ${
                        col.align === "right" ? "text-right" : ""
                      } ${col.numeric ? "font-mono tabular-nums" : ""}`}
                    >
                      {col.render ? col.render(row) : (col.value(row) ?? "—")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {(pageSize > 0 && pageCount > 1) || (searchable && query) ? (
        <div className="mt-3 flex items-center justify-between text-[12px] text-acuity-text-ter">
          <span className="tabular-nums">
            {processed.length.toLocaleString()} row
            {processed.length === 1 ? "" : "s"}
            {query ? ` (filtered from ${rows.length.toLocaleString()})` : ""}
          </span>
          {pageSize > 0 && pageCount > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={clampedPage === 0}
                className="rounded-acuity-pill border border-acuity-line px-3 py-1 transition hover:border-acuity-line-strong hover:text-acuity-text-sec disabled:opacity-40"
              >
                Prev
              </button>
              <span className="tabular-nums">
                {clampedPage + 1} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={clampedPage >= pageCount - 1}
                className="rounded-acuity-pill border border-acuity-line px-3 py-1 transition hover:border-acuity-line-strong hover:text-acuity-text-sec disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
