"use client";

import { useEffect, useState } from "react";

type Dimension = {
  area: "CAREER" | "HEALTH" | "RELATIONSHIPS" | "FINANCES" | "PERSONAL" | "OTHER";
  label: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  sortOrder: number;
  isActive: boolean;
};

type Preset = "DEFAULT" | "STUDENT" | "PARENT" | "CUSTOM" | null;

const AREA_ORDER: Dimension["area"][] = [
  "CAREER",
  "HEALTH",
  "RELATIONSHIPS",
  "FINANCES",
  "PERSONAL",
  "OTHER",
];

const CANONICAL_LABELS: Record<Dimension["area"], string> = {
  CAREER: "Career",
  HEALTH: "Health",
  RELATIONSHIPS: "Relationships",
  FINANCES: "Finances",
  PERSONAL: "Personal Growth",
  OTHER: "Other",
};

export function LifeDimensionsSection() {
  const [preset, setPreset] = useState<Preset>(null);
  const [dims, setDims] = useState<Dimension[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/account/life-dimensions")
      .then((r) => r.json())
      .then((d) => {
        setPreset(d.preset ?? null);
        setDims(d.dimensions ?? []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function applyPreset(next: Preset) {
    if (!next) return;
    setSaving(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = { preset: next };
      if (next === "CUSTOM") {
        body.dimensions =
          dims.length > 0
            ? dims
            : AREA_ORDER.map((a, i) => ({
                area: a,
                label: CANONICAL_LABELS[a],
                sortOrder: i,
                isActive: true,
              }));
      }
      const res = await fetch("/api/account/life-dimensions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMsg(err.error ?? `Save failed (${res.status})`);
      } else {
        const d = await res.json();
        setPreset(d.preset);
        setDims(d.dimensions);
        setMsg("Saved.");
        setTimeout(() => setMsg(null), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveCustom() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/account/life-dimensions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: "CUSTOM", dimensions: dims }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMsg(err.error ?? `Save failed (${res.status})`);
      } else {
        const d = await res.json();
        setPreset(d.preset);
        setDims(d.dimensions);
        setMsg("Saved.");
        setTimeout(() => setMsg(null), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  function updateDim(area: Dimension["area"], patch: Partial<Dimension>) {
    setDims((prev) =>
      prev.map((d) => (d.area === area ? { ...d, ...patch } : d))
    );
  }

  return (
    <section className="mt-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-6">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
        Life Matrix dimensions
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Rename the 6 areas that shape your Life Matrix and insights so they
        match how you actually think about your life. Pick a preset or
        customize each label.
      </p>

      {!loaded && (
        <p className="mt-6 text-xs text-zinc-400">Loading…</p>
      )}

      {loaded && (
        <>
          <div className="mt-5 flex flex-wrap gap-2">
            {(["DEFAULT", "STUDENT", "PARENT", "CUSTOM"] as const).map((p) => {
              const active = preset === p || (!preset && p === "DEFAULT");
              return (
                <button
                  key={p}
                  disabled={saving}
                  onClick={() => applyPreset(p)}
                  className={
                    "rounded-full px-4 py-1.5 text-xs font-medium transition " +
                    (active
                      ? "bg-violet-600 text-white"
                      : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:bg-[#1E1E2E] dark:text-zinc-200 dark:hover:bg-white/5")
                  }
                >
                  {p === "DEFAULT"
                    ? "Default"
                    : p === "STUDENT"
                    ? "Student"
                    : p === "PARENT"
                    ? "Parent"
                    : "Custom"}
                </button>
              );
            })}
          </div>

          {preset === "CUSTOM" && (
            <div className="mt-6 space-y-3">
              {AREA_ORDER.map((area) => {
                const d =
                  dims.find((x) => x.area === area) ??
                  ({
                    area,
                    label: CANONICAL_LABELS[area],
                    sortOrder: AREA_ORDER.indexOf(area),
                    isActive: true,
                  } as Dimension);
                return (
                  <div
                    key={area}
                    className="flex items-center gap-3 rounded-lg border border-zinc-100 dark:border-white/5 p-3"
                  >
                    <span className="w-28 shrink-0 text-xs uppercase tracking-wider text-zinc-400">
                      {CANONICAL_LABELS[area]}
                    </span>
                    <input
                      value={d.label}
                      maxLength={40}
                      onChange={(e) =>
                        updateDim(area, { label: e.target.value })
                      }
                      placeholder={CANONICAL_LABELS[area]}
                      className="flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-white/10 dark:bg-[#0B0B12] dark:text-zinc-100"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                      <input
                        type="checkbox"
                        checked={d.isActive}
                        onChange={(e) =>
                          updateDim(area, { isActive: e.target.checked })
                        }
                      />
                      Active
                    </label>
                  </div>
                );
              })}
              <button
                disabled={saving}
                onClick={saveCustom}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save custom labels"}
              </button>
            </div>
          )}

          {preset && preset !== "CUSTOM" && dims.length > 0 && (
            <ul className="mt-5 space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300">
              {dims
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((d) => (
                  <li key={d.area} className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: d.color ?? "#71717A" }}
                    />
                    <span className="font-medium">{d.label}</span>
                    <span className="text-xs text-zinc-400">
                      ({CANONICAL_LABELS[d.area]})
                    </span>
                  </li>
                ))}
            </ul>
          )}

          {msg && (
            <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
              {msg}
            </p>
          )}
        </>
      )}
    </section>
  );
}
