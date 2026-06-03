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
  devicePlatform: string | null;
  appVersion: string | null;
  appFirstOpenedAt: string | null;
  signupUtmSource: string | null;
  signupUtmMedium: string | null;
  signupLandingPath: string | null;
  onboardingStatus: string;
  paymentStatus: string;
  downloadReminder: string;
};

type DetailUser = ListUser & {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeCurrentPeriodEnd: string | null;
  isAdmin: boolean;
  latestEntryAt: string | null;
  onboardingCompletedAt: string | null;
  onboardingStep: number | null;
  firstRecordingAt: string | null;
  firstWeeklyReportAt: string | null;
  onboardingEvents?: { event: string; createdAt: string }[];
  signupUtmCampaign: string | null;
  signupUtmContent: string | null;
  signupUtmTerm: string | null;
  signupReferrer: string | null;
};

type Override = {
  id: string;
  flagKey: string;
  enabled: boolean;
  reason: string;
  createdAt: string;
};

type SentEmail = {
  id: string;
  subject: string;
  body: string;
  sentAt: string;
};

type SummaryData = {
  totalUsers: number;
  dau: number;
  wau: number;
  avgPerUserPerWeek: number;
  onboardingCompletionRate: number;
};

export default function UsersTab() {
  const [users, setUsers] = useState<ListUser[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [showBulkEmail, setShowBulkEmail] = useState(false);
  const [summary, setSummary] = useState<SummaryData | null>(null);
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
      if (data.totalCount !== undefined) setTotalCount(data.totalCount);
    },
    [q, nextCursor]
  );

  useEffect(() => {
    setUsers(null);
    setNextCursor(null);
    load({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Load engagement summary cards
  useEffect(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    fetch(`/api/admin/metrics?tab=engagement&start=${weekAgo.toISOString()}&end=${now.toISOString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setSummary({
          totalUsers: d.dau + d.wau, // approximate; actual total loaded from user count
          dau: d.dau ?? 0,
          wau: d.wau ?? 0,
          avgPerUserPerWeek: d.avgPerUserPerWeek ?? 0,
          onboardingCompletionRate: 0, // computed from user list below
        });
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-lg bg-[#13131F] p-4">
            <div className="text-[11px] uppercase tracking-wider text-white/40">DAU</div>
            <div className="text-2xl font-semibold text-white">{summary.dau}</div>
          </div>
          <div className="rounded-lg bg-[#13131F] p-4">
            <div className="text-[11px] uppercase tracking-wider text-white/40">WAU</div>
            <div className="text-2xl font-semibold text-white">{summary.wau}</div>
          </div>
          <div className="rounded-lg bg-[#13131F] p-4">
            <div className="text-[11px] uppercase tracking-wider text-white/40">Avg Entries / User / Week</div>
            <div className="text-2xl font-semibold text-white">{summary.avgPerUserPerWeek}</div>
          </div>
          <div className="rounded-lg bg-[#13131F] p-4">
            <div className="text-[11px] uppercase tracking-wider text-white/40">Total Users</div>
            <div className="text-2xl font-semibold text-white">{totalCount ?? users?.length ?? "—"}</div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Search email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1 rounded-md bg-[#13131F] px-3 py-2 text-sm text-white"
        />
        <button
          onClick={() => setShowBulkEmail(true)}
          className="rounded-md bg-[#7C5CFC] px-3 py-2 text-xs font-medium text-white hover:bg-[#6B4FE0]"
        >
          Send Email to All Users
        </button>
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
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Signup</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Platform</th>
                <th className="px-4 py-3">Last active</th>
                <th className="px-4 py-3">Onboarding</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Recovery</th>
                <th className="px-4 py-3">Trial Ends</th>
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
                  <td className="px-4 py-3">
                    {(u.signupUtmSource || u.signupUtmMedium) ? (
                      <div>
                        <div className="text-xs text-white/70">
                          {[u.signupUtmSource, u.signupUtmMedium].filter(Boolean).join(" / ")}
                        </div>
                        {u.signupLandingPath && u.signupLandingPath !== "/" && (
                          <a
                            href={`https://getacuity.io${u.signupLandingPath}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-[#A78BFA] hover:underline"
                          >
                            {u.signupLandingPath}
                          </a>
                        )}
                      </div>
                    ) : u.signupLandingPath && u.signupLandingPath !== "/" ? (
                      <a
                        href={`https://getacuity.io${u.signupLandingPath}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#A78BFA] hover:underline"
                      >
                        {u.signupLandingPath}
                      </a>
                    ) : (
                      <span className="text-xs text-white/30">direct</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-white/60">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={u.subscriptionStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <PlatformPill
                      platform={u.devicePlatform}
                      appFirstOpenedAt={u.appFirstOpenedAt}
                      lastSeenAt={u.lastSeenAt}
                    />
                  </td>
                  <td className="px-4 py-3 text-xs text-white/60">
                    {u.lastSeenAt ? formatTimeAgo(u.lastSeenAt) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <OnboardingPill status={u.onboardingStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <PaymentPill status={u.paymentStatus} />
                  </td>
                  <td className="px-4 py-3 text-xs text-white/50">
                    {u.downloadReminder}
                  </td>
                  <td className="px-4 py-3 text-xs text-white/50">
                    {u.trialEndsAt && u.subscriptionStatus === "TRIAL"
                      ? new Date(u.trialEndsAt).toLocaleDateString()
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

      {showBulkEmail && (
        <BulkEmailModal onClose={() => setShowBulkEmail(false)} />
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

function PlatformPill({
  platform,
  appFirstOpenedAt,
  lastSeenAt,
}: {
  platform: string | null;
  appFirstOpenedAt: string | null;
  lastSeenAt: string | null;
}) {
  if (!platform && !appFirstOpenedAt) {
    return (
      <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-white/40">
        Never opened app
      </span>
    );
  }
  const label = platform === "ios" ? "iOS" : platform === "android" ? "Android" : platform ?? "App";
  const bg =
    platform === "ios"
      ? "bg-sky-500/20 text-sky-300"
      : "bg-emerald-500/20 text-emerald-300";
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${bg} w-fit`}>
        {label}
      </span>
      {lastSeenAt && (
        <span className="px-2 text-[10px] text-white/30">
          {formatTimeAgo(lastSeenAt)}
        </span>
      )}
    </div>
  );
}

function OnboardingPill({ status }: { status: string }) {
  const PILL_STYLES: Record<string, string> = {
    "Downloaded app": "bg-green-500/20 text-green-300",
    "Using browser": "bg-green-500/20 text-green-300",
    "Reached download": "bg-green-500/20 text-green-300",
    "Paid": "bg-green-500/20 text-green-300",
    "Payment failed": "bg-red-500/20 text-red-300",
    "Checkout abandoned": "bg-amber-500/20 text-amber-300",
    "Account created": "bg-blue-500/20 text-blue-300",
    "Trial (skipped payment)": "bg-amber-500/20 text-amber-300",
    "Reached signup": "bg-violet-500/20 text-violet-300",
    "Signed up (no checkout)": "bg-blue-500/20 text-blue-300",
    "Reached paywall": "bg-blue-500/20 text-blue-300",
    "Saw extraction": "bg-blue-500/20 text-blue-300",
    "Recorded": "bg-violet-500/20 text-violet-300",
    "Started recording": "bg-amber-500/20 text-amber-300",
    "Skipped recording": "bg-amber-500/20 text-amber-300",
    "Saw recording screen": "bg-amber-500/20 text-amber-300",
    "Funnel: mirror": "bg-violet-500/20 text-violet-300",
    "Funnel: started quiz": "bg-amber-500/20 text-amber-300",
    "Funnel: page loaded": "bg-white/10 text-white/50",
    "Not started": "bg-white/5 text-white/40",
    // Legacy fallback
    "Complete": "bg-green-500/20 text-green-300",
    "Incomplete": "bg-amber-500/20 text-amber-300",
  };
  const bg = PILL_STYLES[status] ?? "bg-white/5 text-white/40";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${bg}`}>
      {status}
    </span>
  );
}

function PaymentPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Active: "bg-green-500/20 text-green-300",
    Trial: "bg-yellow-500/20 text-yellow-300",
    Expired: "bg-orange-500/20 text-orange-300",
    Churned: "bg-red-500/20 text-red-300",
    "Past Due": "bg-amber-500/20 text-amber-300",
    Failed: "bg-red-500/20 text-red-300",
    None: "bg-white/5 text-white/40",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles.None}`}>
      {status}
    </span>
  );
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ─── User Detail Modal ───────────────────────────────────────────

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
  const [showCompose, setShowCompose] = useState(false);
  const [sentEmails, setSentEmails] = useState<SentEmail[] | null>(null);

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

  const loadEmails = useCallback(async () => {
    const res = await fetch(`/api/admin/users/${userId}/emails`, {
      cache: "no-store",
    });
    if (res.ok) {
      const d = await res.json();
      setSentEmails(d.emails);
    }
  }, [userId]);

  useEffect(() => {
    load();
    loadEmails();
  }, [load, loadEmails]);

  async function resendWelcome() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/resend-welcome`, {
        method: "POST",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      alert(`Welcome email sent to ${d.email}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

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
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-[#0A0A0F] p-6 text-white">
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
                    ? formatTimeAgo(data.user.lastSeenAt)
                    : "—"}
                </span>
              </div>
              <div className="mt-1 text-xs text-white/50">
                {data.user.devicePlatform ? (
                  <>
                    Last seen:{" "}
                    {data.user.devicePlatform === "ios" ? "iOS" : "Android"}
                    {data.user.appVersion && `, v${data.user.appVersion}`}
                    {data.user.lastSeenAt &&
                      `, ${formatTimeAgo(data.user.lastSeenAt)}`}
                  </>
                ) : (
                  "Never opened app"
                )}
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

            {/* Attribution */}
            <div className="rounded-md bg-[#13131F] p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                Attribution
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-white/40">Landing page</dt>
                  <dd>
                    {data.user.signupLandingPath && data.user.signupLandingPath !== "/" ? (
                      <a
                        href={`https://getacuity.io${data.user.signupLandingPath}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#A78BFA] hover:underline"
                      >
                        {data.user.signupLandingPath}
                      </a>
                    ) : (
                      "direct"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-white/40">Source</dt>
                  <dd>{data.user.signupUtmSource || "—"}</dd>
                </div>
                <div>
                  <dt className="text-white/40">Medium</dt>
                  <dd>{data.user.signupUtmMedium || "—"}</dd>
                </div>
                <div>
                  <dt className="text-white/40">Campaign</dt>
                  <dd className="truncate max-w-[150px]">{data.user.signupUtmCampaign || "—"}</dd>
                </div>
                <div>
                  <dt className="text-white/40">Content</dt>
                  <dd className="truncate max-w-[150px]">{data.user.signupUtmContent || "—"}</dd>
                </div>
                <div>
                  <dt className="text-white/40">Referrer</dt>
                  <dd className="truncate max-w-[150px]">{data.user.signupReferrer || "—"}</dd>
                </div>
              </dl>
            </div>

            <JourneyTimeline user={data.user} />

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

            {/* Email compose / history */}
            <div className="rounded-md bg-[#13131F] p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-white/40">
                  Emails sent ({sentEmails?.length ?? 0})
                </div>
                <button
                  onClick={() => setShowCompose(!showCompose)}
                  className="text-xs text-[#A78BFA] hover:underline"
                >
                  {showCompose ? "Cancel" : "Send Email"}
                </button>
              </div>

              {showCompose && (
                <ComposeEmail
                  toEmail={data.user.email}
                  targetUserId={data.user.id}
                  onSent={() => {
                    setShowCompose(false);
                    loadEmails();
                  }}
                  onError={setError}
                />
              )}

              {sentEmails && sentEmails.length > 0 && (
                <ul className="mt-2 space-y-2">
                  {sentEmails.map((e) => (
                    <li key={e.id} className="rounded bg-white/5 p-2 text-xs">
                      <div className="flex justify-between text-white/40">
                        <span className="font-medium text-white/70">{e.subject}</span>
                        <span>{new Date(e.sentAt).toLocaleDateString()}</span>
                      </div>
                      <div className="mt-1 whitespace-pre-wrap text-white/50 line-clamp-2">
                        {e.body}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {sentEmails && sentEmails.length === 0 && !showCompose && (
                <p className="text-xs text-white/40">No emails sent to this user yet.</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
              <button
                onClick={resendWelcome}
                disabled={busy}
                className="rounded-md bg-emerald-500/20 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30"
              >
                Resend welcome email
              </button>
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

// ─── Journey Timeline ────────────────────────────────────────────

function JourneyTimeline({ user }: { user: DetailUser }) {
  type Milestone = {
    label: string;
    date: string | null;
    detail?: string;
  };

  // Build event-based milestones from OnboardingEvent records
  const eventMap: Record<string, string> = {};
  for (const e of user.onboardingEvents ?? []) {
    if (!eventMap[e.event]) eventMap[e.event] = e.createdAt;
  }

  const milestones: Milestone[] = [
    { label: "Account created", date: user.createdAt },
    {
      label: "Recording screen viewed",
      date: eventMap["onboarding_recording_screen_viewed"] ?? null,
    },
    {
      label: "First recording completed",
      date: eventMap["onboarding_recording_completed"] ?? user.firstRecordingAt,
    },
    {
      label: "Extraction viewed",
      date: eventMap["onboarding_extraction_viewed"] ?? null,
    },
    {
      label: "Download CTA reached",
      date: eventMap["onboarding_download_screen_viewed"] ?? null,
    },
    {
      label: "App downloaded",
      date: user.appFirstOpenedAt ?? eventMap["onboarding_app_store_clicked"] ?? null,
      detail: user.devicePlatform
        ? `${user.devicePlatform === "ios" ? "iOS" : "Android"}`
        : undefined,
    },
  ];

  // Find the index of the last completed milestone to determine drop-off
  const lastCompleted = milestones.reduce(
    (acc, m, i) => (m.date ? i : acc),
    -1
  );

  return (
    <div className="rounded-md bg-[#13131F] p-3">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
        Signup journey
      </div>
      <div className="relative space-y-0">
        {milestones.map((m, i) => {
          const done = Boolean(m.date);
          const isDropOff = !done && i === lastCompleted + 1;
          return (
            <div key={m.label} className="flex items-start gap-3">
              {/* Vertical line + dot */}
              <div className="flex flex-col items-center">
                <div
                  className={`h-3 w-3 rounded-full border-2 ${
                    done
                      ? "border-green-400 bg-green-400"
                      : isDropOff
                      ? "border-amber-400 bg-transparent"
                      : "border-white/20 bg-transparent"
                  }`}
                />
                {i < milestones.length - 1 && (
                  <div
                    className={`w-px flex-1 min-h-[20px] ${
                      done && milestones[i + 1]?.date
                        ? "bg-green-400/40"
                        : "bg-white/10"
                    }`}
                  />
                )}
              </div>
              {/* Label + date */}
              <div className="pb-3 -mt-0.5">
                <div
                  className={`text-xs font-medium ${
                    done
                      ? "text-white/80"
                      : isDropOff
                      ? "text-amber-300"
                      : "text-white/30"
                  }`}
                >
                  {m.label}
                  {isDropOff && (
                    <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">
                      dropped off
                    </span>
                  )}
                </div>
                {done && m.date && (
                  <div className="text-[11px] text-white/40">
                    {new Date(m.date).toLocaleString()}
                    {m.detail && ` · ${m.detail}`}
                  </div>
                )}
                {!done && m.detail && (
                  <div className="text-[11px] text-white/40">{m.detail}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Compose Email (single user) ─────────────────────────────────

function ComposeEmail({
  toEmail,
  targetUserId,
  onSent,
  onError,
}: {
  toEmail: string;
  targetUserId: string;
  onSent: () => void;
  onError: (msg: string) => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/admin/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: toEmail,
          targetUserId,
          subject: subject.trim(),
          body: body.trim(),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      setSent(true);
      setTimeout(onSent, 1500);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="my-2 rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-300">
        Sent!
      </div>
    );
  }

  return (
    <div className="my-2 space-y-2">
      <div className="text-xs text-white/40">
        From: Keenan &lt;keenan@getacuity.io&gt;
      </div>
      <div className="text-xs text-white/40">
        To: {toEmail}
      </div>
      <input
        type="text"
        placeholder="Subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="w-full rounded-md bg-[#0A0A0F] border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30"
      />
      <textarea
        placeholder="Email body (plain text)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        className="w-full rounded-md bg-[#0A0A0F] border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 resize-y"
      />
      <button
        onClick={handleSend}
        disabled={sending || !subject.trim() || !body.trim()}
        className="rounded-md bg-[#7C5CFC] px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
      >
        {sending ? "Sending…" : "Send"}
      </button>
    </div>
  );
}

// ─── Bulk Email Modal ────────────────────────────────────────────

function BulkEmailModal({ onClose }: { onClose: () => void }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [userCount, setUserCount] = useState<number | null>(null);

  useEffect(() => {
    // Fetch total user count for the confirmation dialog
    fetch("/api/admin/users?limit=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        // The list endpoint doesn't return total count, so we'll show
        // "all users" in the confirmation. The API excludes founders.
      })
      .catch(() => {});
  }, []);

  async function handleSend() {
    if (!subject.trim() || !body.trim()) return;

    if (!confirming) {
      setConfirming(true);
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/admin/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bulk: true,
          subject: subject.trim(),
          body: body.trim(),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      setResult({ sent: d.sent, failed: d.failed });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSending(false);
      setConfirming(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-lg bg-[#0A0A0F] p-6 text-white">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Send Email to All Users</h3>
          <button
            onClick={onClose}
            className="text-sm text-white/40 hover:text-white"
          >
            close
          </button>
        </div>

        {result ? (
          <div className="space-y-3">
            <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-300">
              Sent to {result.sent} user{result.sent !== 1 ? "s" : ""}.
              {result.failed > 0 && (
                <span className="text-red-300"> {result.failed} failed.</span>
              )}
            </div>
            <button
              onClick={onClose}
              className="rounded-md bg-white/10 px-4 py-2 text-xs font-medium hover:bg-white/20"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-white/40">
              From: Keenan &lt;keenan@getacuity.io&gt;
            </div>
            <p className="text-xs text-white/50">
              Sends to all users except keenan@heelerdigital.com and jim@heelerdigital.com.
            </p>
            <input
              type="text"
              placeholder="Subject"
              value={subject}
              onChange={(e) => { setSubject(e.target.value); setConfirming(false); }}
              className="w-full rounded-md bg-[#13131F] border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30"
            />
            <textarea
              placeholder="Email body (plain text)"
              value={body}
              onChange={(e) => { setBody(e.target.value); setConfirming(false); }}
              rows={6}
              className="w-full rounded-md bg-[#13131F] border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 resize-y"
            />

            {confirming && (
              <div className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                Are you sure? This will send to every user in the database (excluding you and Jimmy).
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleSend}
                disabled={sending || !subject.trim() || !body.trim()}
                className={`rounded-md px-4 py-2 text-xs font-medium text-white disabled:opacity-50 ${
                  confirming
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-[#7C5CFC] hover:bg-[#6B4FE0]"
                }`}
              >
                {sending
                  ? "Sending…"
                  : confirming
                  ? "Yes, send to all users"
                  : "Send to all users"}
              </button>
              <button
                onClick={onClose}
                className="rounded-md bg-white/10 px-4 py-2 text-xs font-medium hover:bg-white/20"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
