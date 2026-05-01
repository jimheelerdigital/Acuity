"use client";

import { useCallback, useEffect, useState } from "react";

type Flag = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  rolloutPercentage: number;
  requiredTier: "FREE" | "PRO" | null;
  updatedAt: string;
};

/**
 * Clamp arbitrary input to a valid rollout percentage.
 * - Coerces strings to numbers
 * - Floors fractions (rollout is integer-only on the server)
 * - Rejects NaN / negative / >100 by clamping back into range
 * Returns null when the input cannot be coerced (empty string, "abc"),
 * letting the caller decide whether to keep the prior value or 0.
 */
function clampRollout(input: string | number): number | null {
  if (input === "" || input === null || input === undefined) return null;
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.floor(n)));
}

type Override = {
  id: string;
  userId: string;
  flagKey: string;
  enabled: boolean;
  reason: string;
  createdAt: string;
};

type LookupUser = {
  id: string;
  email: string;
  createdAt: string;
  subscriptionStatus: string;
  trialEndsAt: string | null;
};

export default function FeatureFlagsTab() {
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const loadFlags = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/feature-flags", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setFlags(data.flags);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    loadFlags();
  }, [loadFlags]);

  async function patch(id: string, patch: Partial<Pick<Flag, "enabled" | "rolloutPercentage" | "requiredTier">>) {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      const res = await fetch(`/api/admin/feature-flags/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setFlags((prev) => prev?.map((f) => (f.id === id ? data.flag : f)) ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-4 text-lg font-semibold">Flags</h2>
        {error && (
          <div className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
        {flags === null ? (
          <p className="text-sm text-white/40">Loading…</p>
        ) : (
          <div className="overflow-x-auto rounded-lg bg-[#13131F]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-white/40">
                  <th className="px-4 py-3">Flag</th>
                  <th className="px-4 py-3">Enabled</th>
                  <th className="px-4 py-3">Rollout %</th>
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {flags.map((f) => (
                  <tr
                    key={f.id}
                    className="border-t border-white/5"
                    title={f.description ?? ""}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{f.name}</div>
                      <div className="font-mono text-xs text-white/40">{f.key}</div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => patch(f.id, { enabled: !f.enabled })}
                        disabled={busy[f.id]}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          f.enabled
                            ? "bg-green-500/20 text-green-300"
                            : "bg-white/5 text-white/40"
                        }`}
                      >
                        {f.enabled ? "ON" : "OFF"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <RolloutEditor
                        savedValue={f.rolloutPercentage}
                        disabled={busy[f.id]}
                        onCommit={(value) =>
                          patch(f.id, { rolloutPercentage: value })
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={f.requiredTier ?? ""}
                        onChange={(e) =>
                          patch(f.id, {
                            requiredTier:
                              e.target.value === ""
                                ? null
                                : (e.target.value as "FREE" | "PRO"),
                          })
                        }
                        disabled={busy[f.id]}
                        className="rounded-md bg-[#0A0A0F] px-2 py-1 text-xs text-white"
                      >
                        <option value="">Any</option>
                        <option value="FREE">FREE</option>
                        <option value="PRO">PRO</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs text-white/40">
                      {new Date(f.updatedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <UserOverridesSection onMutation={loadFlags} />
    </div>
  );
}

/**
 * Per-row rollout-percentage editor. Holds local state so typing or
 * dragging doesn't fire a PATCH on every keystroke / drag-tick (the
 * old behavior was that the range slider auto-saved on every value
 * change, which made precise selection nearly impossible because each
 * tick fired a network round-trip).
 *
 * Commit happens on:
 *   - Pressing Enter in the number input
 *   - Blurring the number input (after edit)
 *   - Releasing the slider (mouseup / touchend / pointerup / blur)
 *   - Clicking the explicit "Save" button (visible only when dirty)
 *
 * Local state syncs back to props when the prop changes (i.e. after a
 * successful save the parent re-renders with the new server value).
 */
function RolloutEditor({
  savedValue,
  disabled,
  onCommit,
}: {
  savedValue: number;
  disabled: boolean;
  onCommit: (value: number) => void;
}) {
  // `text` mirrors what's in the number input so partial input ("" while
  // typing a new number) doesn't yo-yo back to the saved value mid-keystroke.
  const [text, setText] = useState<string>(String(savedValue));
  const [sliderValue, setSliderValue] = useState<number>(savedValue);

  // Re-sync from props when the parent re-renders with a new saved value
  // (e.g. after a successful PATCH from this same row, or after a list refresh).
  useEffect(() => {
    setText(String(savedValue));
    setSliderValue(savedValue);
  }, [savedValue]);

  const parsed = clampRollout(text);
  const dirty = parsed !== null && parsed !== savedValue;
  const invalid = text.trim() !== "" && parsed === null;

  function commit(): void {
    if (parsed === null) {
      // Reject the edit — restore the saved value
      setText(String(savedValue));
      setSliderValue(savedValue);
      return;
    }
    if (parsed === savedValue) return;
    onCommit(parsed);
  }

  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={sliderValue}
        onChange={(e) => {
          const v = Number(e.target.value);
          setSliderValue(v);
          setText(String(v));
        }}
        onPointerUp={() => commit()}
        onKeyUp={(e) => {
          // Arrow-key adjustments commit on key release so keyboard users
          // can tab through and step values without each Arrow firing a PATCH.
          if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") {
            commit();
          }
        }}
        disabled={disabled}
        aria-label="Rollout percentage slider"
        aria-valuenow={sliderValue}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${sliderValue} percent`}
        className="accent-[#7C5CFC] flex-1 max-w-[160px]"
      />
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={100}
        step={1}
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const n = clampRollout(raw);
          if (n !== null) setSliderValue(n);
        }}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur(); // triggers commit via onBlur
          } else if (e.key === "Escape") {
            // Discard the edit
            setText(String(savedValue));
            setSliderValue(savedValue);
            (e.target as HTMLInputElement).blur();
          }
        }}
        disabled={disabled}
        aria-label="Rollout percentage"
        aria-invalid={invalid || undefined}
        className={`w-14 rounded-md bg-[#0A0A0F] px-2 py-1 text-right font-mono text-xs text-white outline-none ${
          invalid
            ? "ring-1 ring-red-500"
            : dirty
              ? "ring-1 ring-amber-400/60"
              : ""
        }`}
      />
      <span className="font-mono text-xs text-white/40">%</span>
      {dirty && !invalid && (
        <button
          onClick={() => commit()}
          disabled={disabled}
          className="rounded-md bg-[#7C5CFC] px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
      )}
      {dirty && !invalid && (
        <span className="text-xs text-white/40 font-mono">
          {savedValue}%→{parsed}%
        </span>
      )}
    </div>
  );
}

function UserOverridesSection({ onMutation }: { onMutation: () => void }) {
  const [email, setEmail] = useState("");
  const [user, setUser] = useState<LookupUser | null>(null);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [flagKeys, setFlagKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Seed the list of flag keys from the flags endpoint so the override
  // dropdown matches the current set without hardcoding.
  useEffect(() => {
    fetch("/api/admin/feature-flags", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) =>
        Array.isArray(d.flags) ? setFlagKeys(d.flags.map((f: Flag) => f.key)) : null
      );
  }, []);

  async function lookup() {
    setError(null);
    setUser(null);
    setOverrides([]);
    try {
      const res = await fetch(
        `/api/admin/feature-flags/overrides?email=${encodeURIComponent(email.trim())}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed");
      setUser(data.user);
      setOverrides(data.overrides);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function upsertOverride(
    flagKey: string,
    enabled: boolean,
    reason: string
  ) {
    if (!user) return;
    const res = await fetch("/api/admin/feature-flags/overrides", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: user.id, flagKey, enabled, reason }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed");
      return;
    }
    await lookup();
    onMutation();
  }

  async function deleteOverride(id: string) {
    const res = await fetch(`/api/admin/feature-flags/overrides/${id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed");
      return;
    }
    await lookup();
    onMutation();
  }

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold">User overrides</h2>
      <div className="rounded-lg bg-[#13131F] p-4">
        <div className="flex flex-wrap gap-2">
          <input
            type="email"
            placeholder="user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 rounded-md bg-[#0A0A0F] px-3 py-2 text-sm text-white"
          />
          <button
            onClick={lookup}
            className="rounded-md bg-[#7C5CFC] px-4 py-2 text-sm font-medium"
          >
            Look up
          </button>
        </div>
        {error && (
          <div className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
        {user && (
          <div className="mt-4 space-y-4">
            <div className="text-sm">
              <div className="font-mono text-xs text-white/40">{user.id}</div>
              <div className="text-white">{user.email}</div>
              <div className="text-xs text-white/40">
                {user.subscriptionStatus} · signed up{" "}
                {new Date(user.createdAt).toLocaleDateString()}
                {user.trialEndsAt
                  ? ` · trial ends ${new Date(user.trialEndsAt).toLocaleDateString()}`
                  : ""}
              </div>
            </div>

            <div className="rounded-md bg-[#0A0A0F] p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                Current overrides ({overrides.length})
              </div>
              {overrides.length === 0 ? (
                <p className="text-sm text-white/40">None.</p>
              ) : (
                <ul className="space-y-2">
                  {overrides.map((o) => (
                    <li
                      key={o.id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <div>
                        <span className="font-mono text-xs text-white/60">
                          {o.flagKey}
                        </span>
                        <span
                          className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                            o.enabled
                              ? "bg-green-500/20 text-green-300"
                              : "bg-red-500/20 text-red-300"
                          }`}
                        >
                          {o.enabled ? "ON" : "OFF"}
                        </span>
                        <span className="ml-2 text-xs text-white/40">
                          {o.reason}
                        </span>
                      </div>
                      <button
                        onClick={() => deleteOverride(o.id)}
                        className="text-xs text-white/40 hover:text-red-300"
                      >
                        remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <NewOverrideForm flagKeys={flagKeys} onSubmit={upsertOverride} />
          </div>
        )}
      </div>
    </section>
  );
}

function NewOverrideForm({
  flagKeys,
  onSubmit,
}: {
  flagKeys: string[];
  onSubmit: (flagKey: string, enabled: boolean, reason: string) => void;
}) {
  const [flagKey, setFlagKey] = useState(flagKeys[0] ?? "");
  const [enabled, setEnabled] = useState(true);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!flagKey && flagKeys[0]) setFlagKey(flagKeys[0]);
  }, [flagKeys, flagKey]);

  // Surface why Save is disabled instead of silently swallowing clicks
  // (the prior implementation just returned early on a too-short reason
  // or empty flagKey, leaving the user wondering whether the click
  // registered).
  const reasonTrimmed = reason.trim();
  const reasonTooShort = reasonTrimmed.length > 0 && reasonTrimmed.length < 3;
  const canSubmit = flagKey !== "" && reasonTrimmed.length >= 3;

  return (
    <div className="rounded-md bg-[#0A0A0F] p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
        Add / update override
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_2fr_auto]">
        <select
          value={flagKey}
          onChange={(e) => setFlagKey(e.target.value)}
          className="rounded-md bg-[#13131F] px-2 py-2 text-sm text-white"
        >
          {flagKeys.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select
          value={enabled ? "on" : "off"}
          onChange={(e) => setEnabled(e.target.value === "on")}
          className="rounded-md bg-[#13131F] px-2 py-2 text-sm text-white"
        >
          <option value="on">ON</option>
          <option value="off">OFF</option>
        </select>
        <input
          type="text"
          placeholder="Reason (min 3 chars)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-invalid={reasonTooShort || undefined}
          className={`rounded-md bg-[#13131F] px-2 py-2 text-sm text-white outline-none ${
            reasonTooShort ? "ring-1 ring-red-500" : ""
          }`}
        />
        <button
          onClick={() => {
            if (!canSubmit) return;
            onSubmit(flagKey, enabled, reasonTrimmed);
            setReason("");
          }}
          disabled={!canSubmit}
          className="rounded-md bg-[#7C5CFC] px-4 py-2 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save
        </button>
      </div>
      {reasonTooShort && (
        <p className="mt-2 text-xs text-red-300">
          Reason must be at least 3 characters.
        </p>
      )}
    </div>
  );
}
