"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type ListUser = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  signupUtmSource: string | null;
  signupUtmMedium: string | null;
  signupLandingPath: string | null;
  signupMethod: string | null;
  subscriptionStatus: string;
  planStatus: string;
  platform: "iOS" | "Web" | "Both" | "None";
  lifecycle: string;
  entryCount: number;
  entriesThisWeek: number;
  lastEntryAt: string | null;
  streak: number;
  weeklyReportCount: number;
  lastActive: string | null;
  trialEndsAt: string | null;
  downloadReminder: string;
};

type SummaryStats = {
  totalUsers: number;
  downloadedOrWeb: number;
  recordedAtLeast1: number;
  activeThisWeek: number;
  atRisk: number;
  neverRecorded: number;
  paying: number;
  avgEntriesPerActiveUser: number;
  downloadStages?: {
    viewed: number;
    blockedWebview: number;
    tappedAppStore: number;
    bouncedFromStore: number;
  };
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
  lastSeenAt: string | null;
  devicePlatform: string | null;
  appVersion: string | null;
  appFirstOpenedAt: string | null;
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

const LIFECYCLE_OPTIONS = [
  "Signed up", "Viewed download", "Blocked in webview", "Tapped App Store",
  "Bounced from store", "Attempted download", "App downloaded", "First debrief", "Exploring",
  "Building habit", "Active user", "At risk", "Churned",
];

export default function UsersTab() {
  const [users, setUsers] = useState<ListUser[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [q, setQ] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState("");
  const [sortField, setSortField] = useState("createdAt");
  const [sortDir, setSortDir] = useState("desc");
  const [selected, setSelected] = useState<string | null>(null);
  const [showBulkEmail, setShowBulkEmail] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const sel = searchParams.get("select");
    if (sel) setSelected(sel);
  }, [searchParams]);

  const load = useCallback(
    async (opts: { reset?: boolean } = {}) => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (!opts.reset && nextCursor) params.set("cursor", nextCursor);
      if (lifecycleFilter) params.set("lifecycle", lifecycleFilter);
      if (sortField !== "createdAt") params.set("sort", sortField);
      if (sortDir === "asc") params.set("dir", "asc");
      const res = await fetch(`/api/admin/users?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (opts.reset) {
        setUsers(data.users);
      } else {
        setUsers((prev) => (prev ? [...prev, ...data.users] : data.users));
      }
      setNextCursor(data.nextCursor);
      if (data.summary) setSummary(data.summary);
    },
    [q, nextCursor, lifecycleFilter, sortField, sortDir]
  );

  useEffect(() => {
    setUsers(null);
    setNextCursor(null);
    load({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, lifecycleFilter, sortField, sortDir]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const handleStripeSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/stripe-sync", { method: "POST" });
      const data = await res.json();
      setSyncResult(`Synced: ${data.summary.updated} updated, ${data.summary.alreadyCurrent} current, ${data.summary.orphaned} orphaned`);
      load({ reset: true });
    } catch {
      setSyncResult("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const needsAttention = () => {
    setLifecycleFilter("Signed up,Downloaded,At risk,Churned");
  };

  const S = summary;

  return (
    <div className="space-y-6">
      {/* ── Summary cards ── */}
      {S && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard label="Total Users" value={S.totalUsers} />
          <SummaryCard label="Downloaded / Web" value={S.downloadedOrWeb} sub={`${S.totalUsers > 0 ? Math.round((S.downloadedOrWeb / S.totalUsers) * 100) : 0}% of total`} />
          <SummaryCard label="Recorded 1+" value={S.recordedAtLeast1} sub={`${S.downloadedOrWeb > 0 ? Math.round((S.recordedAtLeast1 / S.downloadedOrWeb) * 100) : 0}% of downloaded`} />
          <SummaryCard label="Active This Week" value={S.activeThisWeek} sub={`${S.totalUsers > 0 ? Math.round((S.activeThisWeek / S.totalUsers) * 100) : 0}% of total`} />
          <SummaryCard label="At Risk" value={S.atRisk} color="text-orange-300" />
          <SummaryCard label="Never Recorded" value={S.neverRecorded} sub={`${S.totalUsers > 0 ? Math.round((S.neverRecorded / S.totalUsers) * 100) : 0}% of total`} color="text-red-300" />
          <SummaryCard label="Paying" value={S.paying} color="text-green-300" />
          <SummaryCard label="Avg Entries / Active / Week" value={S.avgEntriesPerActiveUser} />
        </div>
      )}

      {/* ── Download-stage breakdown (where stuck users sit before they open the app) ── */}
      {S?.downloadStages && (
        <div className="rounded-lg border border-white/10 bg-[#13131F] p-3">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-white/40">
            Stuck at download — most-advanced step reached
          </div>
          <div className="flex flex-wrap gap-2">
            <DownloadStageChip label="Viewed download" value={S.downloadStages.viewed} color="text-sky-200" onClick={() => setLifecycleFilter("Viewed download")} />
            <DownloadStageChip label="Blocked in webview" value={S.downloadStages.blockedWebview} color="text-rose-300" onClick={() => setLifecycleFilter("Blocked in webview")} />
            <DownloadStageChip label="Tapped App Store" value={S.downloadStages.tappedAppStore} color="text-sky-300" onClick={() => setLifecycleFilter("Tapped App Store")} />
            <DownloadStageChip label="Bounced from store" value={S.downloadStages.bouncedFromStore} color="text-amber-300" onClick={() => setLifecycleFilter("Bounced from store")} />
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="Search email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1 min-w-[200px] rounded-md bg-[#13131F] px-3 py-2 text-sm text-white placeholder-white/30"
        />
        <select
          value={lifecycleFilter}
          onChange={(e) => setLifecycleFilter(e.target.value)}
          className="rounded-md bg-[#13131F] px-3 py-2 text-xs text-white/70 border border-white/10"
        >
          <option value="">All stages</option>
          {LIFECYCLE_OPTIONS.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button
          onClick={needsAttention}
          className="rounded-md bg-orange-500/20 px-3 py-2 text-xs font-medium text-orange-300 hover:bg-orange-500/30"
        >
          Needs attention
        </button>
        <button
          onClick={handleStripeSync}
          disabled={syncing}
          className="rounded-md bg-[#13131F] border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/5 disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync with Stripe"}
        </button>
        <button
          onClick={() => setShowBulkEmail(true)}
          className="rounded-md bg-[#7C5CFC] px-3 py-2 text-xs font-medium text-white hover:bg-[#6B4FE0]"
        >
          Send Email
        </button>
      </div>

      {syncResult && (
        <div className="rounded-md bg-[#13131F] px-3 py-2 text-xs text-white/60">
          {syncResult}
        </div>
      )}

      {nextCursor && (
        <button onClick={() => load()} className="text-sm text-[#A78BFA] hover:underline">
          Load more…
        </button>
      )}

      {/* ── Table ── */}
      {users === null ? (
        <p className="text-sm text-white/40">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-white/40">No users match.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-[#13131F]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-white/40">
                <th className="px-3 py-3">Email</th>
                <th className="px-3 py-3">Source</th>
                <th className="px-3 py-3">Method</th>
                <SortHeader label="Signup" field="createdAt" current={sortField} dir={sortDir} onClick={toggleSort} />
                <th className="px-3 py-3">Plan</th>
                <th className="px-3 py-3">Platform</th>
                <th className="px-3 py-3">Lifecycle</th>
                <SortHeader label="Entries" field="entries" current={sortField} dir={sortDir} onClick={toggleSort} />
                <SortHeader label="Last Entry" field="lastEntry" current={sortField} dir={sortDir} onClick={toggleSort} />
                <th className="px-3 py-3">Streak</th>
                <th className="px-3 py-3">Reports</th>
                <SortHeader label="Last Active" field="lastActive" current={sortField} dir={sortDir} onClick={toggleSort} />
                <th className="px-3 py-3">Recovery</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className={`border-t border-white/5 hover:bg-white/5 ${
                    u.lifecycle === "At risk" ? "bg-orange-500/[0.03]" :
                    u.lifecycle === "Churned" ? "bg-red-500/[0.03]" : ""
                  }`}
                >
                  {/* Name + Email */}
                  <td className="px-3 py-2.5 max-w-[200px]">
                    <div className="text-xs font-medium text-white/90 truncate">{firstName(u.name)}</div>
                    <div className="text-[11px] text-white/50 truncate">{u.email}</div>
                  </td>

                  {/* Source */}
                  <td className="px-3 py-2.5 text-[11px] text-white/50">
                    {u.signupUtmSource ? `${u.signupUtmSource}${u.signupUtmMedium ? ` / ${u.signupUtmMedium}` : ""}` : "direct"}
                  </td>

                  {/* Signup Method */}
                  <td className="px-3 py-2.5 text-[11px]">
                    {u.signupMethod === "email" ? (
                      <span className="text-white/60">Email</span>
                    ) : u.signupMethod === "google" ? (
                      <span className="text-blue-300">Google</span>
                    ) : u.signupMethod === "apple" ? (
                      <span className="text-white/80">Apple</span>
                    ) : (
                      <span className="text-white/25">Unknown</span>
                    )}
                  </td>

                  {/* Signup */}
                  <td className="px-3 py-2.5 text-[11px] text-white/50 tabular-nums">
                    {new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </td>

                  {/* Plan */}
                  <td className="px-3 py-2.5">
                    <PlanPill status={u.planStatus} />
                  </td>

                  {/* Platform */}
                  <td className="px-3 py-2.5">
                    <PlatformPill platform={u.platform} />
                  </td>

                  {/* Lifecycle */}
                  <td className="px-3 py-2.5">
                    <LifecyclePill stage={u.lifecycle} />
                  </td>

                  {/* Entries */}
                  <td className="px-3 py-2.5 text-[11px] tabular-nums">
                    <span className={
                      u.entriesThisWeek > 0 ? "text-green-300" :
                      u.entryCount > 0 && u.lastEntryAt && daysSince(u.lastEntryAt) <= 7 ? "text-yellow-300" :
                      u.entryCount > 0 ? "text-red-300" : "text-white/30"
                    }>
                      {u.entryCount} total{u.entriesThisWeek > 0 ? ` (${u.entriesThisWeek} this week)` : ""}
                    </span>
                  </td>

                  {/* Last Entry */}
                  <td className="px-3 py-2.5 text-[11px] text-white/50">
                    {u.lastEntryAt ? formatTimeAgo(u.lastEntryAt) : "Never"}
                  </td>

                  {/* Streak */}
                  <td className="px-3 py-2.5 text-[11px] text-white/50">
                    {u.streak > 0 ? `${u.streak}d` : "—"}
                  </td>

                  {/* Weekly Reports */}
                  <td className="px-3 py-2.5 text-[11px] text-white/50 tabular-nums">
                    {u.weeklyReportCount > 0 ? `${u.weeklyReportCount} sent` : "—"}
                  </td>

                  {/* Last Active */}
                  <td className="px-3 py-2.5 text-[11px] text-white/50">
                    {u.lastActive ? formatTimeAgo(u.lastActive) : "—"}
                  </td>

                  {/* Recovery */}
                  <td className="px-3 py-2.5 text-[11px] text-white/40">
                    {u.downloadReminder}
                  </td>

                  {/* View */}
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={() => setSelected(u.id)} className="text-[11px] text-[#A78BFA] hover:underline">
                      view
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <UserDetailModal userId={selected} onClose={() => setSelected(null)} onMutation={() => load({ reset: true })} />
      )}
      {showBulkEmail && (
        <BulkEmailModal onClose={() => setShowBulkEmail(false)} />
      )}
    </div>
  );
}

// ── Helper components ────────────────────────────────────────────

function SummaryCard({ label, value, sub, color }: { label: string; value: number; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg bg-[#13131F] p-4">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`text-xl font-semibold ${color ?? "text-white"}`}>{value}</div>
      {sub && <div className="text-[11px] text-white/25 mt-0.5">{sub}</div>}
    </div>
  );
}

function DownloadStageChip({ label, value, color, onClick }: { label: string; value: number; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-baseline gap-1.5 rounded-md bg-white/[0.03] px-3 py-1.5 text-left transition hover:bg-white/[0.07]"
    >
      <span className={`text-base font-semibold ${color}`}>{value}</span>
      <span className="text-[11px] text-white/50">{label}</span>
    </button>
  );
}

function SortHeader({ label, field, current, dir, onClick }: { label: string; field: string; current: string; dir: string; onClick: (f: string) => void }) {
  const active = current === field;
  return (
    <th className="px-3 py-3 cursor-pointer hover:text-white/60 select-none" onClick={() => onClick(field)}>
      {label} {active ? (dir === "desc" ? "↓" : "↑") : ""}
    </th>
  );
}

function PlanPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  const bg = s.startsWith("paid") ? "bg-green-500/20 text-green-300"
    : s.startsWith("trial") ? "bg-yellow-500/20 text-yellow-300"
    : s.startsWith("expired") ? "bg-orange-500/20 text-orange-300"
    : s === "churned" ? "bg-red-500/20 text-red-300"
    : s === "past due" ? "bg-amber-500/20 text-amber-300"
    : "bg-white/5 text-white/40";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${bg}`}>{status}</span>;
}

function PlatformPill({ platform }: { platform: string }) {
  const bg = platform === "iOS" ? "bg-sky-500/20 text-sky-300"
    : platform === "Web" ? "bg-emerald-500/20 text-emerald-300"
    : platform === "Both" ? "bg-violet-500/20 text-violet-300"
    : "bg-white/5 text-white/30";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${bg}`}>{platform}</span>;
}

function LifecyclePill({ stage }: { stage: string }) {
  const STYLES: Record<string, string> = {
    "Signed up": "bg-white/10 text-white/50",
    "Viewed download": "bg-sky-500/10 text-sky-200",
    "Blocked in webview": "bg-rose-500/20 text-rose-300",
    "Tapped App Store": "bg-sky-500/20 text-sky-300",
    "Bounced from store": "bg-amber-500/20 text-amber-300",
    "Attempted download": "bg-sky-500/20 text-sky-300",
    "App downloaded": "bg-blue-500/20 text-blue-300",
    "First debrief": "bg-teal-500/20 text-teal-300",
    "Exploring": "bg-lime-500/20 text-lime-300",
    "Building habit": "bg-green-500/20 text-green-300",
    "Active user": "bg-emerald-500/20 text-emerald-300",
    "At risk": "bg-orange-500/20 text-orange-300",
    "Churned": "bg-red-500/20 text-red-300",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${STYLES[stage] ?? "bg-white/5 text-white/40"}`}>{stage}</span>;
}

function firstName(name: string | null): string {
  if (!name || !name.trim()) return "—";
  return name.trim().split(/\s+/)[0];
}

function daysSince(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / 86400000;
}

function formatTimeAgo(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
  const [data, setData] = useState<{ user: DetailUser; overrides: Override[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [sentEmails, setSentEmails] = useState<SentEmail[] | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/admin/users/${userId}`, { cache: "no-store" });
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "Failed"); return; }
    setData(d);
  }, [userId]);

  const loadEmails = useCallback(async () => {
    const res = await fetch(`/api/admin/users/${userId}/emails`, { cache: "no-store" });
    if (res.ok) { const d = await res.json(); setSentEmails(d.emails); }
  }, [userId]);

  useEffect(() => { load(); loadEmails(); }, [load, loadEmails]);

  async function resendWelcome() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/resend-welcome`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      alert(`Welcome email sent to ${d.email}`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function sendMagicLink() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/magic-link`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      alert("Reset email sent.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function extendTrial() {
    const daysRaw = prompt("Extend trial by how many days? (1–90)");
    if (!daysRaw) return;
    const days = Number(daysRaw);
    if (!Number.isFinite(days) || days < 1 || days > 90) { alert("Days must be 1–90."); return; }
    const reason = prompt("Reason (audit log)?");
    if (!reason || reason.trim().length < 3) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/extend-trial`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ days, reason: reason.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      await load(); onMutation();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function softDelete() {
    if (!data) return;
    const typed = prompt(`Type the user's email to confirm hard-delete: ${data.user.email}`);
    if (typed?.trim().toLowerCase() !== data.user.email.toLowerCase()) { alert("Email did not match."); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      onMutation(); onClose();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-[#0A0A0F] p-6 text-white">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">User detail</h3>
          <button onClick={onClose} className="text-sm text-white/40 hover:text-white">close</button>
        </div>
        {error && <div className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}
        {!data ? (
          <p className="text-sm text-white/40">Loading…</p>
        ) : (
          <div className="space-y-4 text-sm">
            <div>
              <div className="text-xs font-mono text-white/40">{data.user.id}</div>
              <div className="text-base font-medium">{data.user.email}</div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-white/60">
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{data.user.subscriptionStatus}</span>
                {data.user.isAdmin && <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-purple-300">admin</span>}
                <span>signed up {new Date(data.user.createdAt).toLocaleDateString()}</span>
                <span>last active {data.user.lastSeenAt ? formatTimeAgo(data.user.lastSeenAt) : "—"}</span>
              </div>
              <div className="mt-1 text-xs text-white/50">
                {data.user.devicePlatform
                  ? `${data.user.devicePlatform === "ios" ? "iOS" : "Android"}${data.user.appVersion ? `, v${data.user.appVersion}` : ""}`
                  : "No mobile app"}
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3 rounded-md bg-[#13131F] p-3 text-xs">
              <div><dt className="text-white/40">Trial ends</dt><dd>{data.user.trialEndsAt ? new Date(data.user.trialEndsAt).toLocaleString() : "—"}</dd></div>
              <div><dt className="text-white/40">Period end</dt><dd>{data.user.stripeCurrentPeriodEnd ? new Date(data.user.stripeCurrentPeriodEnd).toLocaleString() : "—"}</dd></div>
              <div><dt className="text-white/40">Entries</dt><dd className="tabular-nums">{data.user.entryCount}</dd></div>
              <div><dt className="text-white/40">Latest entry</dt><dd>{data.user.latestEntryAt ? new Date(data.user.latestEntryAt).toLocaleDateString() : "—"}</dd></div>
              <div className="col-span-2">
                <dt className="text-white/40">Stripe</dt>
                <dd>{data.user.stripeCustomerId ? (
                  <a href={`https://dashboard.stripe.com/customers/${data.user.stripeCustomerId}`} target="_blank" rel="noopener noreferrer" className="text-[#A78BFA] hover:underline">{data.user.stripeCustomerId}</a>
                ) : "—"}</dd>
              </div>
            </dl>
            {/* Attribution */}
            <div className="rounded-md bg-[#13131F] p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">Attribution</div>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div><dt className="text-white/40">Landing</dt><dd>{data.user.signupLandingPath && data.user.signupLandingPath !== "/" ? data.user.signupLandingPath : "direct"}</dd></div>
                <div><dt className="text-white/40">Source</dt><dd>{data.user.signupUtmSource || "—"}</dd></div>
                <div><dt className="text-white/40">Medium</dt><dd>{data.user.signupUtmMedium || "—"}</dd></div>
                <div><dt className="text-white/40">Campaign</dt><dd className="truncate max-w-[150px]">{data.user.signupUtmCampaign || "—"}</dd></div>
              </dl>
            </div>
            <JourneyTimeline user={data.user} />
            {/* Overrides */}
            <div className="rounded-md bg-[#13131F] p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">Feature overrides ({data.overrides.length})</div>
              {data.overrides.length === 0 ? (
                <p className="text-xs text-white/40">None.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {data.overrides.map((o) => (
                    <li key={o.id}><span className="font-mono text-white/60">{o.flagKey}</span> → <span className={o.enabled ? "text-green-300" : "text-red-300"}>{o.enabled ? "ON" : "OFF"}</span> <span className="text-white/40">— {o.reason}</span></li>
                  ))}
                </ul>
              )}
            </div>
            {/* Emails */}
            <div className="rounded-md bg-[#13131F] p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-white/40">Emails ({sentEmails?.length ?? 0})</div>
                <button onClick={() => setShowCompose(!showCompose)} className="text-xs text-[#A78BFA] hover:underline">{showCompose ? "Cancel" : "Send Email"}</button>
              </div>
              {showCompose && <ComposeEmail toEmail={data.user.email} targetUserId={data.user.id} onSent={() => { setShowCompose(false); loadEmails(); }} onError={setError} />}
              {sentEmails && sentEmails.length > 0 && (
                <ul className="mt-2 space-y-2">{sentEmails.map((e) => (
                  <li key={e.id} className="rounded bg-white/5 p-2 text-xs">
                    <div className="flex justify-between text-white/40"><span className="font-medium text-white/70">{e.subject}</span><span>{new Date(e.sentAt).toLocaleDateString()}</span></div>
                    <div className="mt-1 whitespace-pre-wrap text-white/50 line-clamp-2">{e.body}</div>
                  </li>
                ))}</ul>
              )}
            </div>
            {/* Actions */}
            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
              <button onClick={resendWelcome} disabled={busy} className="rounded-md bg-emerald-500/20 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30">Resend welcome</button>
              <button onClick={sendMagicLink} disabled={busy} className="rounded-md bg-white/10 px-3 py-2 text-xs font-medium hover:bg-white/20">Password reset</button>
              <button onClick={extendTrial} disabled={busy} className="rounded-md bg-[#7C5CFC] px-3 py-2 text-xs font-medium">Extend trial…</button>
              <button onClick={softDelete} disabled={busy} className="rounded-md bg-red-500/20 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/30">Delete…</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Journey Timeline ────────────────────────────────────────────

function JourneyTimeline({ user }: { user: DetailUser }) {
  type Milestone = { label: string; date: string | null; detail?: string };
  const eventMap: Record<string, string> = {};
  for (const e of user.onboardingEvents ?? []) {
    if (!eventMap[e.event]) eventMap[e.event] = e.createdAt;
  }
  const milestones: Milestone[] = [
    { label: "Account created", date: user.createdAt },
    { label: "Recording screen", date: eventMap["onboarding_recording_screen_viewed"] ?? null },
    { label: "First recording", date: eventMap["onboarding_recording_completed"] ?? user.firstRecordingAt },
    { label: "Extraction viewed", date: eventMap["onboarding_extraction_viewed"] ?? null },
    { label: "Download CTA", date: eventMap["onboarding_download_screen_viewed"] ?? null },
    { label: "App opened", date: user.appFirstOpenedAt ?? eventMap["onboarding_app_store_clicked"] ?? null, detail: user.devicePlatform ? (user.devicePlatform === "ios" ? "iOS" : "Android") : undefined },
  ];
  const lastCompleted = milestones.reduce((acc, m, i) => (m.date ? i : acc), -1);

  return (
    <div className="rounded-md bg-[#13131F] p-3">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">Journey</div>
      <div className="space-y-0">
        {milestones.map((m, i) => {
          const done = Boolean(m.date);
          const isDropOff = !done && i === lastCompleted + 1;
          return (
            <div key={m.label} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div className={`h-3 w-3 rounded-full border-2 ${done ? "border-green-400 bg-green-400" : isDropOff ? "border-amber-400 bg-transparent" : "border-white/20 bg-transparent"}`} />
                {i < milestones.length - 1 && <div className={`w-px flex-1 min-h-[20px] ${done && milestones[i + 1]?.date ? "bg-green-400/40" : "bg-white/10"}`} />}
              </div>
              <div className="pb-3 -mt-0.5">
                <div className={`text-xs font-medium ${done ? "text-white/80" : isDropOff ? "text-amber-300" : "text-white/30"}`}>
                  {m.label}
                  {isDropOff && <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">dropped off</span>}
                </div>
                {done && m.date && <div className="text-[11px] text-white/40">{new Date(m.date).toLocaleString()}{m.detail ? ` · ${m.detail}` : ""}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Compose Email ─────────────────────────────────────────────

function ComposeEmail({ toEmail, targetUserId, onSent, onError }: { toEmail: string; targetUserId: string; onSent: () => void; onError: (msg: string) => void }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/admin/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: toEmail, targetUserId, subject: subject.trim(), body: body.trim() }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      setSent(true);
      setTimeout(onSent, 1500);
    } catch (e) { onError((e as Error).message); } finally { setSending(false); }
  }

  if (sent) return <div className="my-2 rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-300">Sent!</div>;

  return (
    <div className="my-2 space-y-2">
      <div className="text-xs text-white/40">From: Keenan &lt;keenan@getacuity.io&gt; → {toEmail}</div>
      <input type="text" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded-md bg-[#0A0A0F] border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30" />
      <textarea placeholder="Email body" value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="w-full rounded-md bg-[#0A0A0F] border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 resize-y" />
      <button onClick={handleSend} disabled={sending || !subject.trim() || !body.trim()} className="rounded-md bg-[#7C5CFC] px-4 py-2 text-xs font-medium text-white disabled:opacity-50">{sending ? "Sending…" : "Send"}</button>
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

  async function handleSend() {
    if (!subject.trim() || !body.trim()) return;
    if (!confirming) { setConfirming(true); return; }
    setSending(true);
    try {
      const res = await fetch("/api/admin/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bulk: true, subject: subject.trim(), body: body.trim() }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      setResult({ sent: d.sent, failed: d.failed });
    } catch (e) { alert((e as Error).message); } finally { setSending(false); setConfirming(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-lg bg-[#0A0A0F] p-6 text-white">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Send Email to All Users</h3>
          <button onClick={onClose} className="text-sm text-white/40 hover:text-white">close</button>
        </div>
        {result ? (
          <div className="space-y-3">
            <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-300">
              Sent to {result.sent} user{result.sent !== 1 ? "s" : ""}.{result.failed > 0 && <span className="text-red-300"> {result.failed} failed.</span>}
            </div>
            <button onClick={onClose} className="rounded-md bg-white/10 px-4 py-2 text-xs font-medium hover:bg-white/20">Done</button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-white/50">Sends to all users except founders.</p>
            <input type="text" placeholder="Subject" value={subject} onChange={(e) => { setSubject(e.target.value); setConfirming(false); }} className="w-full rounded-md bg-[#13131F] border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30" />
            <textarea placeholder="Email body" value={body} onChange={(e) => { setBody(e.target.value); setConfirming(false); }} rows={6} className="w-full rounded-md bg-[#13131F] border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 resize-y" />
            {confirming && <div className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-300">Are you sure? This sends to every user (excluding founders).</div>}
            <div className="flex gap-2">
              <button onClick={handleSend} disabled={sending || !subject.trim() || !body.trim()} className={`rounded-md px-4 py-2 text-xs font-medium text-white disabled:opacity-50 ${confirming ? "bg-amber-600" : "bg-[#7C5CFC]"}`}>{sending ? "Sending…" : confirming ? "Yes, send" : "Send to all"}</button>
              <button onClick={onClose} className="rounded-md bg-white/10 px-4 py-2 text-xs font-medium hover:bg-white/20">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
