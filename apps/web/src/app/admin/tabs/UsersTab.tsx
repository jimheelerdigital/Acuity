"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type ListUser = {
  id: string;
  email: string;
  createdAt: string;
  lastSeenAt: string | null;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  entryCount: number;
};

type DetailUser = ListUser & {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeCurrentPeriodEnd: string | null;
  isAdmin: boolean;
  latestEntryAt: string | null;
};

type Override = {
  id: string;
  flagKey: string;
  enabled: boolean;
  reason: string;
  createdAt: string;
};

export default function UsersTab() {
  const [users, setUsers] = useState<ListUser[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const searchParams = useSearchParams();

  // Deep-link from drilldown modals: /admin?tab=users&select=<userId>
  // opens that user's detail modal on tab mount. We don't strip the
  // param after opening — back/forward stays consistent and re-mounts
  // re-open the modal predictably.
  useEffect(() => {
    const sel = searchParams.get("select");
    if (sel) setSelected(sel);
  }, [searchParams]);

  const load = useCallback(
    async (opts: { reset?: boolean } = {}) => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (!opts.reset && nextCursor) params.set("cursor", nextCursor);
      const res = await fetch(`/api/admin/users?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (opts.reset) {
        setUsers(data.users);
      } else {
        setUsers((prev) => (prev ? [...prev, ...data.users] : data.users));
      }
      setNextCursor(data.nextCursor);
    },
    [q, nextCursor]
  );

  useEffect(() => {
    setUsers(null);
    setNextCursor(null);
    load({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Search email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1 rounded-md bg-[#13131F] px-3 py-2 text-sm text-white"
        />
      </div>
      {users === null ? (
        <p className="text-sm text-white/40">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-white/40">No users match.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-[#13131F]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-white/40">
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Signup</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Last active</th>
                <th className="px-4 py-3 text-right">Entries</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-t border-white/5 hover:bg-white/5"
                >
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3 text-xs text-white/60">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={u.subscriptionStatus} />
                  </td>
                  <td className="px-4 py-3 text-xs text-white/60">
                    {u.lastSeenAt
                      ? new Date(u.lastSeenAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {u.entryCount}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelected(u.id)}
                      className="text-xs text-[#A78BFA] hover:underline"
                    >
                      view
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {nextCursor && (
        <button
          onClick={() => load()}
          className="text-sm text-[#A78BFA] hover:underline"
        >
          Load more…
        </button>
      )}

      {selected && (
        <UserDetailModal
          userId={selected}
          onClose={() => setSelected(null)}
          onMutation={() => load({ reset: true })}
        />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const bg =
    status === "PRO"
      ? "bg-green-500/20 text-green-300"
      : status === "TRIAL"
      ? "bg-blue-500/20 text-blue-300"
      : status === "PAST_DUE"
      ? "bg-amber-500/20 text-amber-300"
      : "bg-white/5 text-white/40";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${bg}`}>
      {status}
    </span>
  );
}

function UserDetailModal({
  userId,
  onClose,
  onMutation,
}: {
  userId: string;
  onClose: () => void;
  onMutation: () => void;
}) {
  const [data, setData] = useState<{
    user: DetailUser;
    overrides: Override[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/admin/users/${userId}`, {
      cache: "no-store",
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Failed");
      return;
    }
    setData(d);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function sendMagicLink() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/magic-link`, {
        method: "POST",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      alert("Reset email sent.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function extendTrial() {
    const daysRaw = prompt("Extend trial by how many days? (1–90)");
    if (!daysRaw) return;
    const days = Number(daysRaw);
    if (!Number.isFinite(days) || days < 1 || days > 90) {
      alert("Days must be 1–90.");
      return;
    }
    const reason = prompt("Reason (audit log)?");
    if (!reason || reason.trim().length < 3) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/extend-trial`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ days, reason: reason.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      await load();
      onMutation();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function softDelete() {
    if (!data) return;
    const typed = prompt(
      `Type the user's email to confirm hard-delete: ${data.user.email}`
    );
    if (typed?.trim().toLowerCase() !== data.user.email.toLowerCase()) {
      alert("Email did not match. Nothing deleted.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      onMutation();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-[#0A0A0F] p-6 text-white">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">User detail</h3>
          <button
            onClick={onClose}
            className="text-sm text-white/40 hover:text-white"
          >
            close
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {!data ? (
          <p className="text-sm text-white/40">Loading…</p>
        ) : (
          <div className="space-y-4 text-sm">
            <div>
              <div className="text-xs font-mono text-white/40">{data.user.id}</div>
              <div className="text-base font-medium">{data.user.email}</div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-white/60">
                <StatusPill status={data.user.subscriptionStatus} />
                {data.user.isAdmin && (
                  <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-purple-300">
                    admin
                  </span>
                )}
                <span>
                  signed up{" "}
                  {new Date(data.user.createdAt).toLocaleDateString()}
                </span>
                <span>
                  last active{" "}
                  {data.user.lastSeenAt
                    ? new Date(data.user.lastSeenAt).toLocaleDateString()
                    : "—"}
                </span>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 rounded-md bg-[#13131F] p-3 text-xs">
              <div>
                <dt className="text-white/40">Trial ends</dt>
                <dd>
                  {data.user.trialEndsAt
                    ? new Date(data.user.trialEndsAt).toLocaleString()
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-white/40">Current period end</dt>
                <dd>
                  {data.user.stripeCurrentPeriodEnd
                    ? new Date(
                        data.user.stripeCurrentPeriodEnd
                      ).toLocaleString()
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-white/40">Entries</dt>
                <dd className="tabular-nums">{data.user.entryCount}</dd>
              </div>
              <div>
                <dt className="text-white/40">Most recent entry</dt>
                <dd>
                  {data.user.latestEntryAt
                    ? new Date(data.user.latestEntryAt).toLocaleDateString()
                    : "—"}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-white/40">Stripe</dt>
                <dd>
                  {data.user.stripeCustomerId ? (
                    <a
                      href={`https://dashboard.stripe.com/customers/${data.user.stripeCustomerId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#A78BFA] hover:underline"
                    >
                      {data.user.stripeCustomerId}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-white/40">Sentry</dt>
                <dd>
                  <a
                    href={`https://sentry.io/issues/?query=user.id%3A${encodeURIComponent(
                      data.user.id
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#A78BFA] hover:underline"
                  >
                    filtered issues
                  </a>
                </dd>
              </div>
            </dl>

            <div className="rounded-md bg-[#13131F] p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                Feature overrides ({data.overrides.length})
              </div>
              {data.overrides.length === 0 ? (
                <p className="text-xs text-white/40">
                  None. Manage from the Feature Flags tab.
                </p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {data.overrides.map((o) => (
                    <li key={o.id}>
                      <span className="font-mono text-white/60">
                        {o.flagKey}
                      </span>{" "}
                      →{" "}
                      <span
                        className={
                          o.enabled ? "text-green-300" : "text-red-300"
                        }
                      >
                        {o.enabled ? "ON" : "OFF"}
                      </span>{" "}
                      <span className="text-white/40">— {o.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
              <button
                onClick={sendMagicLink}
                disabled={busy}
                className="rounded-md bg-white/10 px-3 py-2 text-xs font-medium hover:bg-white/20"
              >
                Send password reset
              </button>
              <button
                onClick={extendTrial}
                disabled={busy}
                className="rounded-md bg-[#7C5CFC] px-3 py-2 text-xs font-medium"
              >
                Extend trial…
              </button>
              <button
                onClick={softDelete}
                disabled={busy}
                className="rounded-md bg-red-500/20 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/30"
              >
                Delete account…
              </button>
            </div>

            <p className="pt-2 text-xs text-white/40">
              Metadata only. No entries, transcripts, goals, or AI output are
              visible here by design.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
