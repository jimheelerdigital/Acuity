"use client";

/**
 * Lanes admin (2026-09-15, co-pilot lane system) — the kill/birth
 * lever. Lists every ContentLane with 45-day post counts; Keenan can
 * retire a lane, revive it, promote TESTING → ACTIVE, or birth a new
 * spec-driven lane. Sunday intelligence report proposes; this page
 * (or Claude, via the same API) executes his decisions.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";

interface LaneRow {
  id: string;
  key: string;
  name: string;
  brand: string;
  status: string;
  template: string;
  hoursUtc: number[];
  spec: { audience?: string; theme?: string; named?: boolean } | null;
  origin: string | null;
  retiredAt: string | null;
  recentPosts: number;
}

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-400",
  TESTING: "bg-amber-500/15 text-amber-400",
  RETIRED: "bg-white/5 text-acuity-text-ter",
};

export default function LanesPage() {
  const [lanes, setLanes] = useState<LaneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBirth, setShowBirth] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/content-factory/lanes")
      .then((r) => r.json())
      .then((d) => setLanes(d.lanes ?? []))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  async function setStatus(key: string, status: string) {
    if (
      status === "RETIRED" &&
      !confirm(`Retire lane "${key}"? It stops generating tonight. Revival is one click.`)
    )
      return;
    setBusy(key);
    setError(null);
    const res = await fetch("/api/admin/content-factory/lanes", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, status }),
    });
    if (!res.ok) setError((await res.json()).error ?? "Update failed");
    setBusy(null);
    load();
  }

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Content Lanes</h1>
          <p className="text-sm text-acuity-text-ter">
            The daily generation roster. Retiring a lane stops it tonight — no
            deploy. New lanes start in TESTING and use the spec-driven
            moody-family pipeline.
          </p>
        </div>
        <button
          onClick={() => setShowBirth((s) => !s)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-acuity-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New Lane
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {showBirth && <BirthForm onDone={() => { setShowBirth(false); load(); }} />}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 text-acuity-text-ter animate-spin" />
        </div>
      ) : (
        <div className="rounded-acuity-lg border border-acuity-line bg-acuity-card-bg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-acuity-line text-left text-xs text-acuity-text-ter">
                <th className="px-4 py-3 font-medium">Lane</th>
                <th className="px-4 py-3 font-medium">Brand</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Hours (UTC)</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Posts (45d)</th>
                <th className="px-4 py-3 font-medium w-40">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lanes.map((l) => (
                <tr key={l.id} className="border-b border-acuity-line">
                  <td className="px-4 py-3">
                    <div className="text-white font-medium">{l.name}</div>
                    <div className="text-xs font-mono text-acuity-text-ter">{l.key}</div>
                  </td>
                  <td className="px-4 py-3 text-acuity-text-ter uppercase text-xs">{l.brand}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[l.status] ?? ""}`}>
                      {l.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-acuity-text-ter font-mono text-xs">
                    {l.hoursUtc.join(", ")}
                  </td>
                  <td className="px-4 py-3 text-acuity-text-ter text-xs">
                    {l.template === "code" ? "built-in" : "spec-driven"}
                  </td>
                  <td className="px-4 py-3 text-acuity-text-ter">{l.recentPosts}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {busy === l.key ? (
                        <Loader2 className="h-4 w-4 animate-spin text-acuity-text-ter" />
                      ) : l.status === "RETIRED" ? (
                        <button
                          onClick={() => setStatus(l.key, "ACTIVE")}
                          className="rounded-md border border-acuity-line px-2 py-1 text-xs text-acuity-text-ter hover:text-white transition-colors"
                        >
                          Revive
                        </button>
                      ) : (
                        <>
                          {l.status === "TESTING" && (
                            <button
                              onClick={() => setStatus(l.key, "ACTIVE")}
                              className="rounded-md border border-acuity-line px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                            >
                              Promote
                            </button>
                          )}
                          <button
                            onClick={() => setStatus(l.key, "RETIRED")}
                            className="rounded-md border border-acuity-line px-2 py-1 text-xs text-acuity-text-ter hover:text-red-400 transition-colors"
                          >
                            Retire
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function BirthForm({ onDone }: { onDone: () => void }) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [brand, setBrand] = useState<"ripple" | "bwk">("ripple");
  const [hours, setHours] = useState("6");
  const [audience, setAudience] = useState<"women" | "men">("women");
  const [named, setNamed] = useState(false);
  const [theme, setTheme] = useState("");
  const [origin, setOrigin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/content-factory/lanes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key,
        name,
        brand,
        hoursUtc: hours
          .split(",")
          .map((h) => Number(h.trim()))
          .filter((h) => !Number.isNaN(h)),
        spec: { audience, theme, named },
        origin,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Create failed");
      return;
    }
    onDone();
  }

  const input =
    "w-full rounded-lg border border-acuity-line bg-acuity-bg-inset px-3 py-2 text-sm text-white placeholder:text-acuity-text-ter focus:outline-none focus:border-acuity-primary";

  return (
    <div className="mb-6 rounded-acuity-lg border border-acuity-line bg-acuity-card-bg p-5 space-y-4">
      <h2 className="text-sm font-semibold text-white">Birth a new lane</h2>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-acuity-text-ter mb-1">Key (slug)</label>
          <input className={input} value={key} onChange={(e) => setKey(e.target.value)} placeholder="quiet-wins" />
        </div>
        <div>
          <label className="block text-xs text-acuity-text-ter mb-1">Display name</label>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Quiet Wins" />
        </div>
        <div>
          <label className="block text-xs text-acuity-text-ter mb-1">Brand</label>
          <select
            className={input}
            value={brand}
            onChange={(e) => {
              const b = e.target.value as "ripple" | "bwk";
              setBrand(b);
              setAudience(b === "bwk" ? "men" : "women");
            }}
          >
            <option value="ripple">Ripple (women 40-50)</option>
            <option value="bwk">Build With Key (men 18-30)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-acuity-text-ter mb-1">
            Dispatch hours UTC (comma-sep, 5-8 = overnight)
          </label>
          <input className={input} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="6" />
        </div>
        <div>
          <label className="block text-xs text-acuity-text-ter mb-1">Item headers</label>
          <select className={input} value={named ? "yes" : "no"} onChange={(e) => setNamed(e.target.value === "yes")}>
            <option value="no">No — headerless lines (memento style)</option>
            <option value="yes">Yes — &quot;Name.&quot; header (protocol style)</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs text-acuity-text-ter mb-1">
          Locked theme — write it as: THEME — every post belongs to the X family: ... (include rotation + title rules)
        </label>
        <textarea className={`${input} h-32`} value={theme} onChange={(e) => setTheme(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs text-acuity-text-ter mb-1">Origin (why this lane — report reasoning)</label>
        <input className={input} value={origin} onChange={(e) => setOrigin(e.target.value)} />
      </div>
      <button
        onClick={submit}
        disabled={saving}
        className="inline-flex items-center gap-1.5 rounded-lg bg-acuity-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create in TESTING
      </button>
    </div>
  );
}
