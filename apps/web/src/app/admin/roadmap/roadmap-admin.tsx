"use client";

import { useCallback, useEffect, useState } from "react";

import {
  ROADMAP_STATUSES,
  SUMMARY_MAX,
  TITLE_MAX,
  type RoadmapItemDTO,
  type RoadmapStatus,
} from "@/lib/roadmap";

type Draft = {
  title: string;
  summary: string;
  status: RoadmapStatus;
  sortOrder: string;
  shippedVersion: string;
};

const EMPTY: Draft = { title: "", summary: "", status: "considering", sortOrder: "0", shippedVersion: "" };

const input =
  "w-full rounded-lg border border-acuity-card-border bg-acuity-bg px-3 py-2 text-sm text-acuity-text focus:border-acuity-primary focus:outline-none";
const btn = "rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50";

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
        body: JSON.stringify({
          title: draft.title,
          summary: draft.summary,
          status: draft.status,
          sortOrder: Number(draft.sortOrder) || 0,
          shippedVersion: draft.shippedVersion || null,
        }),
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

  async function patch(id: string, data: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/admin/roadmap/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(body.error ?? `HTTP ${res.status}`);
      return;
    }
    await load();
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
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            className={input}
            placeholder={`Title (≤${TITLE_MAX})`}
            maxLength={TITLE_MAX}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <div className="flex gap-3">
            <select
              className={input}
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value as RoadmapStatus })}
            >
              {ROADMAP_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              className={input}
              placeholder="Order"
              inputMode="numeric"
              value={draft.sortOrder}
              onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })}
            />
            <input
              className={input}
              placeholder="Version (if shipped)"
              value={draft.shippedVersion}
              onChange={(e) => setDraft({ ...draft, shippedVersion: e.target.value })}
            />
          </div>
          <textarea
            className={`${input} sm:col-span-2`}
            rows={2}
            placeholder={`Summary — one or two plain sentences (≤${SUMMARY_MAX})`}
            maxLength={SUMMARY_MAX}
            value={draft.summary}
            onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
          />
        </div>
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
        ROADMAP_STATUSES.map((status) => (
          <section key={status}>
            <h2 className="text-base font-semibold capitalize">
              {status} <span className="text-acuity-text-quiet">({items.filter((i) => i.status === status).length})</span>
            </h2>
            <ul className="mt-3 divide-y divide-acuity-card-border rounded-2xl border border-acuity-card-border bg-acuity-card-bg">
              {items
                .filter((i) => i.status === status)
                .map((it) => (
                  <Row key={it.id} item={it} onPatch={patch} onRemove={remove} />
                ))}
              {items.filter((i) => i.status === status).length === 0 ? (
                <li className="px-4 py-4 text-sm text-acuity-text-sec">None.</li>
              ) : null}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function Row({
  item,
  onPatch,
  onRemove,
}: {
  item: RoadmapItemDTO;
  onPatch: (id: string, data: Record<string, unknown>) => Promise<void>;
  onRemove: (id: string, title: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [summary, setSummary] = useState(item.summary);
  const [version, setVersion] = useState(item.shippedVersion ?? "");

  async function save() {
    await onPatch(item.id, { title, summary, shippedVersion: version || null });
    setEditing(false);
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-10 shrink-0 text-center text-sm font-semibold text-acuity-text-sec" title="votes">
          ▲{item.votes}
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <input className={input} value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
              <textarea className={input} rows={2} value={summary} maxLength={SUMMARY_MAX} onChange={(e) => setSummary(e.target.value)} />
              <input className={input} placeholder="Shipped version, e.g. 1.9.4" value={version} onChange={(e) => setVersion(e.target.value)} />
            </div>
          ) : (
            <>
              <p className="font-medium">{item.title}</p>
              <p className="text-sm text-acuity-text-sec">{item.summary}</p>
              {item.shippedVersion ? (
                <p className="mt-1 text-xs text-acuity-good">Shipped in {item.shippedVersion}</p>
              ) : null}
            </>
          )}
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
                {s}
              </option>
            ))}
          </select>
          {editing ? (
            <>
              <button type="button" className={`${btn} bg-acuity-primary text-white`} onClick={() => void save()}>
                Save
              </button>
              <button type="button" className={`${btn} border border-acuity-card-border`} onClick={() => setEditing(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className={`${btn} border border-acuity-card-border`} onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          <button
            type="button"
            className={`${btn} text-acuity-bad`}
            onClick={() => void onRemove(item.id, item.title)}
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}
