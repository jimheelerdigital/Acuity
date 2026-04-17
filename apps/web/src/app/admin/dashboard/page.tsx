"use client";

import { useState, useEffect, FormEvent } from "react";

/* ---------- types ---------- */
interface DashboardData {
  totalSignups: number;
  signupsBySource: { source: string; count: number }[];
  signupsOverTime: { date: string; count: number }[];
  recentSignups: {
    name: string | null;
    email: string;
    source: string | null;
    createdAt: string;
  }[];
  emailStepCounts: { step: number; count: number }[];
}

const STEP_LABELS: Record<number, string> = {
  0: "Step 0 — Not yet emailed",
  1: "Step 1 — Welcome email",
  2: "Step 2 — What Acuity does",
  3: "Step 3 — Weekly reports feature",
  4: "Step 4 — Founding member pricing",
  5: "Step 5 — Doors opening soon",
};

const QUICK_LINKS = [
  { label: "Supabase Dashboard", href: "https://supabase.com/dashboard" },
  { label: "Vercel Deployments", href: "https://vercel.com" },
  { label: "Google Analytics", href: "https://analytics.google.com" },
  { label: "Hotjar", href: "https://insights.hotjar.com" },
  { label: "Meta Ads Manager", href: "https://adsmanager.facebook.com" },
  { label: "Resend Logs", href: "https://resend.com/emails" },
  { label: "Stripe Dashboard", href: "https://dashboard.stripe.com" },
];

/* ---------- page ---------- */
export default function AdminDashboard() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);

  // Restore session
  useEffect(() => {
    const saved = sessionStorage.getItem("admin-pw");
    if (saved) {
      setPassword(saved);
      fetchData(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchData(pw: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/dashboard", {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) {
        setError("Invalid password");
        setAuthed(false);
        sessionStorage.removeItem("admin-pw");
        setLoading(false);
        return;
      }
      const json: DashboardData = await res.json();
      setData(json);
      setAuthed(true);
      sessionStorage.setItem("admin-pw", pw);
    } catch {
      setError("Failed to load dashboard data");
    }
    setLoading(false);
  }

  function handleLogin(e: FormEvent) {
    e.preventDefault();
    fetchData(password);
  }

  /* ---- login gate ---- */
  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0F]">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm rounded-xl bg-[#13131F] p-8"
        >
          <h1 className="mb-6 text-xl font-semibold text-white">
            Admin Dashboard
          </h1>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-4 w-full rounded-lg border border-white/10 bg-[#0A0A0F] px-4 py-2.5 text-white placeholder:text-white/40 focus:border-[#7C5CFC] focus:outline-none"
          />
          {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#7C5CFC] py-2.5 font-medium text-white transition hover:bg-[#6B4CE0] disabled:opacity-50"
          >
            {loading ? "Loading…" : "Enter"}
          </button>
        </form>
      </div>
    );
  }

  if (!data) return null;

  const maxSource = Math.max(...data.signupsBySource.map((s) => s.count), 1);
  const maxDaily = Math.max(...data.signupsOverTime.map((d) => d.count), 1);

  return (
    <div className="min-h-screen bg-[#0A0A0F] px-4 py-10 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-8 text-2xl font-bold">Acuity Admin Dashboard</h1>

        {/* ── WAITLIST STATS ── */}
        <Section title="Waitlist Stats">
          {/* Total */}
          <Card>
            <p className="text-sm text-white/50">Total Waitlist Signups</p>
            <p className="mt-1 text-4xl font-bold text-[#7C5CFC]">
              {data.totalSignups.toLocaleString()}
            </p>
          </Card>

          {/* By source — bar chart */}
          <Card title="Signups by Source">
            <div className="mt-3 space-y-2">
              {data.signupsBySource.map((s) => (
                <div key={s.source} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-sm text-white/70">
                    {s.source}
                  </span>
                  <div className="relative h-6 flex-1 overflow-hidden rounded bg-white/5">
                    <div
                      className="h-full rounded bg-[#7C5CFC]"
                      style={{
                        width: `${(s.count / maxSource) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="w-10 text-right text-sm font-medium">
                    {s.count}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Over time — daily bar chart */}
          <Card title="Signups Over Time (Last 30 Days)">
            <div className="mt-3 flex items-end gap-[2px]" style={{ height: 160 }}>
              {data.signupsOverTime.map((d) => (
                <div
                  key={d.date}
                  className="group relative flex-1"
                  style={{ height: "100%" }}
                >
                  <div
                    className="absolute bottom-0 w-full rounded-t bg-[#7C5CFC] transition-colors group-hover:bg-[#9B80FF]"
                    style={{
                      height: `${(d.count / maxDaily) * 100}%`,
                      minHeight: d.count > 0 ? 2 : 0,
                    }}
                  />
                  <div className="absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-white/10 px-2 py-0.5 text-xs group-hover:block">
                    {d.date}: {d.count}
                  </div>
                </div>
              ))}
            </div>
            {data.signupsOverTime.length > 0 && (
              <div className="mt-2 flex justify-between text-xs text-white/40">
                <span>{data.signupsOverTime[0].date}</span>
                <span>
                  {data.signupsOverTime[data.signupsOverTime.length - 1].date}
                </span>
              </div>
            )}
          </Card>

          {/* Recent signups table */}
          <Card title="Recent Signups">
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-white/50">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">Email</th>
                    <th className="pb-2 pr-4 font-medium">Source</th>
                    <th className="pb-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentSignups.map((s) => (
                    <tr
                      key={s.email}
                      className="border-b border-white/5 text-white/80"
                    >
                      <td className="py-2 pr-4">{s.name || "—"}</td>
                      <td className="py-2 pr-4">{s.email}</td>
                      <td className="py-2 pr-4">{s.source || "—"}</td>
                      <td className="py-2 whitespace-nowrap">
                        {new Date(s.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Section>

        {/* ── EMAIL STATS ── */}
        <Section title="Email Drip Sequence">
          <Card>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/50">
                  <th className="pb-2 pr-4 font-medium">Step</th>
                  <th className="pb-2 font-medium text-right">Users</th>
                </tr>
              </thead>
              <tbody>
                {data.emailStepCounts.map((row) => (
                  <tr
                    key={row.step}
                    className="border-b border-white/5 text-white/80"
                  >
                    <td className="py-2 pr-4">
                      {STEP_LABELS[row.step] ?? `Step ${row.step}`}
                    </td>
                    <td className="py-2 text-right font-medium">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Section>

        {/* ── QUICK LINKS ── */}
        <Section title="Quick Links">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {QUICK_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-[#13131F] px-4 py-3 text-sm font-medium text-white/80 transition hover:bg-[#1a1a2e] hover:text-[#7C5CFC]"
              >
                {link.label} &rarr;
              </a>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ---------- layout helpers ---------- */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 text-lg font-semibold text-white/90">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Card({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-[#13131F] p-5">
      {title && (
        <h3 className="text-sm font-medium text-white/60">{title}</h3>
      )}
      {children}
    </div>
  );
}
