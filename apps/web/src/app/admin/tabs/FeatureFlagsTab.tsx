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
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={f.rolloutPercentage}
                          onChange={(e) =>
                            patch(f.id, {
                              rolloutPercentage: Number(e.target.value),
                            })
                          }
                          disabled={busy[f.id]}
                          className="accent-[#7C5CFC]"
                        />
                        <span className="w-10 text-right font-mono text-xs text-white/60">
                          {f.rolloutPercentage}%
                        </span>
                      </div>
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
          placeholder="Reason (required)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-md bg-[#13131F] px-2 py-2 text-sm text-white"
        />
        <button
          onClick={() => {
            if (!flagKey || reason.trim().length < 3) return;
            onSubmit(flagKey, enabled, reason.trim());
            setReason("");
          }}
          className="rounded-md bg-[#7C5CFC] px-4 py-2 text-sm font-medium"
        >
          Save
        </button>
      </div>
    </div>
  );
}
