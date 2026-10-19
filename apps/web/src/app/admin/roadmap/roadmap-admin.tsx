"use client";

import { useCallback, useEffect, useState } from "react";

import {
  ROADMAP_CATEGORIES,
  ROADMAP_CATEGORY_META,
  ROADMAP_STATUS_META,
} from "@acuity/shared";

import {
  ROADMAP_STATUSES,
  SECTION_MAX,
  SUMMARY_MAX,
  TIMEFRAME_MAX,
  TITLE_MAX,
  type RoadmapItemDTO,
  type RoadmapItemDetailDTO,
  type RoadmapStatus,
} from "@/lib/roadmap";

/**
 * /admin/roadmap editor (2026-10-18; detail fields 2026-10-19). Each item
 * has the card fields (title, summary, status, category, timing/version)
 * and the detail-page sections (why it matters, what it does, highlights,
 * how to use it). Everything except title + summary is optional.
 */

type Draft = {
  title: string;
  summary: string;
  status: RoadmapStatus;
  sortOrder: string;
  shippedVersion: string;
  category: string;
  timeframe: string;
  problem: string;
  solution: string;
  highlights: string;
  howTo: string;
};

const EMPTY: Draft = {
  title: "",
  summary: "",
  status: "considering",
  sortOrder: "0",
  shippedVersion: "",
  category: "",
  timeframe: "",
  problem: "",
  solution: "",
  highlights: "",
  howTo: "",
};

function toBody(d: Draft) {
  return {
    title: d.title,
    summary: d.summary,
    status: d.status,
    sortOrder: Number(d.sortOrder) || 0,
    shippedVersion: d.shippedVersion || null,
    category: d.category || null,
    timeframe: d.timeframe,
    problem: d.problem,
    solution: d.solution,
    highlights: d.highlights,
    howTo: d.howTo,
  };
}

const input =
  "w-full rounded-lg border border-acuity-card-border bg-acuity-bg px-3 py-2 text-sm text-acuity-text focus:border-acuity-primary focus:outline-none";
const btn = "rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50";
const label = "mb-1 block text-xs font-medium text-acuity-text-sec";

export function RoadmapAdmin() {
  const [items, setItems] = useState<RoadmapItemDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/roadmap", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { items: RoadmapItemDTO[] };
      setItems(body.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toBody(draft)),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setDraft(EMPTY);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  async function patch(id: string, data: Record<string, unknown>): Promise<boolean> {
    setError(null);
    const res = await fetch(`/api/admin/roadmap/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(body.error ?? `HTTP ${res.status}`);
      return false;
    }
    await load();
    return true;
  }

  async function remove(id: string, title: string) {
    if (!window.confirm(`Delete "${title}"? Votes go with it.`)) return;
    const res = await fetch(`/api/admin/roadmap/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(`Delete failed (HTTP ${res.status})`);
      return;
    }
    await load();
  }

  return (
    <div className="mt-8 space-y-10">
      {error ? (
        <p className="rounded-lg border border-acuity-bad/40 bg-acuity-bad-soft px-3 py-2 text-sm">{error}</p>
      ) : null}

      <section className="rounded-2xl border border-acuity-card-border bg-acuity-card-bg p-5">
        <h2 className="text-base font-semibold">Add item</h2>
        <ItemForm draft={draft} onChange={setDraft} />
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            className={`${btn} bg-acuity-primary text-white`}
            disabled={saving || draft.title.trim().length < 3 || draft.summary.trim().length < 3}
            onClick={() => void create()}
          >
            {saving ? "Saving…" : "Add"}
          </button>
        </div>
      </section>

      {items === null ? (
        <p className="text-sm text-acuity-text-sec">Loading…</p>
      ) : (
        ROADMAP_STATUSES.map((status) => {
          const rows = items.filter((i) => i.status === status);
          return (
            <section key={status}>
              <h2 className="text-base font-semibold">
                {ROADMAP_STATUS_META[status].label} <span className="text-acuity-text-quiet">({rows.length})</span>
              </h2>
              <ul className="mt-3 divide-y divide-acuity-card-border rounded-2xl border border-acuity-card-border bg-acuity-card-bg">
                {rows.map((it) => (
                  <Row key={it.id} item={it} onPatch={patch} onRemove={remove} />
                ))}
                {rows.length === 0 ? <li className="px-4 py-4 text-sm text-acuity-text-sec">None.</li> : null}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

function ItemForm({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => onChange({ ...draft, [k]: e.target.value });
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <span className={label}>Title (≤{TITLE_MAX})</span>
        <input className={input} maxLength={TITLE_MAX} value={draft.title} onChange={set("title")} />
      </div>
      <div className="sm:col-span-2">
        <span className={label}>Summary: one or two plain sentences, shown on the card (≤{SUMMARY_MAX})</span>
        <textarea className={input} rows={2} maxLength={SUMMARY_MAX} value={draft.summary} onChange={set("summary")} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-4">
        <div>
          <span className={label}>Status</span>
          <select className={input} value={draft.status} onChange={set("status")}>
            {ROADMAP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ROADMAP_STATUS_META[s].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Category</span>
          <select className={input} value={draft.category} onChange={set("category")}>
            <option value="">None</option>
            {ROADMAP_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {ROADMAP_CATEGORY_META[c].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Timing (planned/building)</span>
          <input
            className={input}
            maxLength={TIMEFRAME_MAX}
            placeholder="e.g. November"
            value={draft.timeframe}
            onChange={set("timeframe")}
          />
        </div>
        <div>
          <span className={label}>Version (shipped)</span>
          <input className={input} placeholder="1.9.5" value={draft.shippedVersion} onChange={set("shippedVersion")} />
        </div>
      </div>
      <div>
        <span className={label}>Why it matters: the problem, in the user&rsquo;s words</span>
        <textarea className={input} rows={4} maxLength={SECTION_MAX} value={draft.problem} onChange={set("problem")} />
      </div>
      <div>
        <span className={label}>What it does / what shipped</span>
        <textarea className={input} rows={4} maxLength={SECTION_MAX} value={draft.solution} onChange={set("solution")} />
      </div>
      <div>
        <span className={label}>Highlights: one per line (max 8)</span>
        <textarea className={input} rows={4} value={draft.highlights} onChange={set("highlights")} />
      </div>
      <div>
        <span className={label}>How to use it (shipped only)</span>
        <textarea className={input} rows={4} maxLength={SECTION_MAX} value={draft.howTo} onChange={set("howTo")} />
      </div>
      <div>
        <span className={label}>Order (lower first, used as a tie-break)</span>
        <input className={input} inputMode="numeric" value={draft.sortOrder} onChange={set("sortOrder")} />
      </div>
    </div>
  );
}

function Row({
  item,
  onPatch,
  onRemove,
}: {
  item: RoadmapItemDTO;
  onPatch: (id: string, data: Record<string, unknown>) => Promise<boolean>;
  onRemove: (id: string, title: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(false);

  async function startEdit() {
    // The list carries card fields only; fetch the detail sections.
    setLoading(true);
    try {
      const res = await fetch(`/api/roadmap/${item.id}`, { cache: "no-store" });
      const body = (await res.json()) as { item: RoadmapItemDetailDTO };
      const d = body.item;
      setDraft({
        title: d.title,
        summary: d.summary,
        status: d.status,
        sortOrder: "0",
        shippedVersion: d.shippedVersion ?? "",
        category: d.category ?? "",
        timeframe: d.timeframe ?? "",
        problem: d.problem ?? "",
        solution: d.solution ?? "",
        highlights: d.highlights.join("\n"),
        howTo: d.howTo ?? "",
      });
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!draft) return;
    // Status is changed from the dropdown (it stamps/clears shippedAt), and
    // sortOrder isn't exposed in the list DTO, so neither is sent here.
    const { status: _s, sortOrder: _o, ...rest } = toBody(draft);
    if (await onPatch(item.id, rest)) setDraft(null);
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-10 shrink-0 text-center text-sm font-semibold text-acuity-text-sec" title="votes">
          ▲{item.votes}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            <a href={`/roadmap/${item.id}`} target="_blank" rel="noreferrer" className="hover:underline">
              {item.title}
            </a>
          </p>
          <p className="text-sm text-acuity-text-sec">{item.summary}</p>
          <p className="mt-1 text-xs text-acuity-text-quiet">
            {[
              item.category ? ROADMAP_CATEGORY_META[item.category].label : "No category",
              item.timeframe,
              item.shippedVersion ? `Shipped in ${item.shippedVersion}` : null,
              item.hasDetails ? "Has detail page content" : "No detail content yet",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <select
            className="rounded-lg border border-acuity-card-border bg-acuity-bg px-2 py-1 text-xs"
            value={item.status}
            onChange={(e) => void onPatch(item.id, { status: e.target.value })}
            aria-label="Status"
          >
            {ROADMAP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ROADMAP_STATUS_META[s].label}
              </option>
            ))}
          </select>
          {draft ? null : (
            <button
              type="button"
              className={`${btn} border border-acuity-card-border`}
              disabled={loading}
              onClick={() => void startEdit()}
            >
              {loading ? "Loading…" : "Edit"}
            </button>
          )}
          <button type="button" className={`${btn} text-acuity-bad`} onClick={() => void onRemove(item.id, item.title)}>
            Delete
          </button>
        </div>
      </div>
      {draft ? (
        <div className="mt-3 rounded-xl border border-acuity-card-border p-4">
          <ItemForm draft={draft} onChange={setDraft} />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className={`${btn} border border-acuity-card-border`} onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button type="button" className={`${btn} bg-acuity-primary text-white`} onClick={() => void save()}>
              Save
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
