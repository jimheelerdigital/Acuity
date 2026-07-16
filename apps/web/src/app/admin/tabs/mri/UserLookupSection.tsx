"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import ChartCard from "../../components/ChartCard";
import type {
  TimelineEvent,
  TimelineEventType,
  UserTimelineResponse,
} from "@/lib/mri/types";

interface Props {
  start: string;
  end: string;
}

/** Minimal shape of a row from the existing /api/admin/users search. */
type UserSearchRow = {
  id: string;
  email: string;
  name: string | null;
  subscriptionStatus?: string | null;
  planStatus?: string | null;
};

// ── Timeline visual mapping ─────────────────────────────────────────────────

const TYPE_ICON: Record<TimelineEventType, string> = {
  onboarding: "🧭",
  entry: "🎙️",
  trial_email: "✉️",
  ai_call: "🤖",
  red_flag: "🚩",
};

const TYPE_LABEL: Record<TimelineEventType, string> = {
  onboarding: "Onboarding",
  entry: "Entry",
  trial_email: "Trial email",
  ai_call: "AI call",
  red_flag: "Red flag",
};

/** Status → dot/border color. */
function statusColor(status: TimelineEvent["status"]): string {
  switch (status) {
    case "ok":
      return "#4ADE80"; // green
    case "warn":
      return "#FBBF24"; // amber
    case "error":
      return "#F87171"; // red
    case "info":
    default:
      return "#8E6FE6"; // accent
  }
}

function fmtAbsolute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "in the future";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── One timeline row (click to reveal raw JSON) ─────────────────────────────

function TimelineRow({ event, index }: { event: TimelineEvent; index: number }) {
  const [open, setOpen] = useState(false);
  const color = statusColor(event.status);
  const icon = TYPE_ICON[event.type] ?? "•";
  const typeLabel = TYPE_LABEL[event.type] ?? event.type;

  return (
    <div
      style={{
        position: "relative",
        paddingLeft: 28,
        paddingBottom: 18,
      }}
    >
      {/* vertical connector line */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 7,
          top: 18,
          bottom: 0,
          width: 2,
          background: "rgba(255,255,255,0.08)",
        }}
      />
      {/* status dot */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 4,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#13131F",
          border: `2px solid ${color}`,
        }}
      />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left"
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
        }}
        aria-expanded={open}
      >
        <div className="flex items-baseline gap-2">
          <span style={{ fontSize: 13 }}>{icon}</span>
          <span
            className="uppercase text-white/40"
            style={{ fontSize: 10, letterSpacing: "1.2px" }}
          >
            {typeLabel}
          </span>
          <span
            className="text-white/35"
            style={{ fontSize: 11 }}
            title={fmtAbsolute(event.at)}
          >
            {fmtRelative(event.at)}
          </span>
        </div>
        <p
          className="mt-0.5"
          style={{ fontSize: 14, color, fontWeight: 500, lineHeight: 1.3 }}
        >
          {event.label}
        </p>
        <p className="mt-0.5 text-white/30" style={{ fontSize: 11 }}>
          {fmtAbsolute(event.at)} · {open ? "hide raw" : "click for raw"}
        </p>
      </button>
      {open && (
        <pre
          className="mt-2 overflow-x-auto rounded-lg text-white/70"
          style={{
            background: "#0A0A0F",
            padding: 12,
            fontSize: 11,
            lineHeight: 1.5,
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {JSON.stringify(event.raw, null, 2)}
        </pre>
      )}
      {/* keep index stable for keys; not rendered */}
      <span hidden>{index}</span>
    </div>
  );
}

// ── User header card ────────────────────────────────────────────────────────

function UserHeader({ user }: { user: UserTimelineResponse["user"] }) {
  const fields: { label: string; value: string }[] = [
    { label: "Status", value: user.subscriptionStatus || "—" },
    { label: "Source", value: user.subscriptionSource || "—" },
    { label: "Platform", value: user.devicePlatform || "web" },
    { label: "UTM", value: user.signupUtmSource || "—" },
    { label: "Signed up", value: fmtAbsolute(user.createdAt) },
    {
      label: "Last seen",
      value: user.lastSeenAt ? fmtRelative(user.lastSeenAt) : "never",
    },
  ];
  return (
    <div
      className="mb-5 rounded-xl"
      style={{
        background: "#0A0A0F",
        padding: 18,
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-baseline gap-3">
        <p className="text-white" style={{ fontSize: 16, fontWeight: 600 }}>
          {user.name || user.email}
        </p>
        {user.name && (
          <p className="text-white/45" style={{ fontSize: 13 }}>
            {user.email}
          </p>
        )}
      </div>
      <p className="mt-1 text-white/30" style={{ fontSize: 11 }}>
        {user.id}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {fields.map((f) => (
          <div key={f.label}>
            <p
              className="uppercase text-white/35"
              style={{ fontSize: 10, letterSpacing: "1.2px" }}
            >
              {f.label}
            </p>
            <p className="mt-0.5 text-white/75" style={{ fontSize: 13 }}>
              {f.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section ─────────────────────────────────────────────────────────────────

export default function UserLookupSection(_props: Props) {
  const [query, setQuery] = useState("");
  // Search results when the email/name resolves to more than one user.
  const [results, setResults] = useState<UserSearchRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [timeline, setTimeline] = useState<UserTimelineResponse | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  const seq = useRef(0);

  // Resolve an email/name to a userId via the existing admin users search,
  // then load that user's MRI timeline.
  const loadTimeline = useCallback(async (userId: string) => {
    const mine = ++seq.current;
    setLoadingTimeline(true);
    setTimelineError(null);
    setTimeline(null);
    try {
      const res = await fetch(
        `/api/admin/mri/user/${encodeURIComponent(userId)}`,
        { cache: "no-store" },
      );
      if (mine !== seq.current) return;
      if (res.status === 404) {
        setTimelineError("User not found.");
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      const json = (await res.json()) as UserTimelineResponse;
      if (mine !== seq.current) return;
      setTimeline(json);
    } catch (err: unknown) {
      if (mine !== seq.current) return;
      setTimelineError(
        err instanceof Error ? err.message : "Failed to load user timeline",
      );
    } finally {
      if (mine === seq.current) setLoadingTimeline(false);
    }
  }, []);

  const runSearch = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q) return;
      setSearching(true);
      setSearchError(null);
      setResults(null);
      setTimeline(null);
      setTimelineError(null);
      try {
        const res = await fetch(
          `/api/admin/users?q=${encodeURIComponent(q)}&limit=25`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          throw new Error(`Search failed (${res.status})`);
        }
        const json = (await res.json()) as { users?: UserSearchRow[] };
        const users = json.users ?? [];
        if (users.length === 0) {
          setSearchError(`No users match "${q}".`);
          return;
        }
        if (users.length === 1) {
          // Unambiguous — jump straight to the timeline.
          await loadTimeline(users[0].id);
          return;
        }
        setResults(users);
      } catch (err: unknown) {
        setSearchError(
          err instanceof Error ? err.message : "Failed to search users",
        );
      } finally {
        setSearching(false);
      }
    },
    [loadTimeline],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runSearch(query);
  };

  const events = timeline?.timeline ?? [];

  return (
    <ChartCard title="User Lookup">
      <p className="mb-4 text-white/40" style={{ fontSize: 12 }}>
        Search by email or name to see a single user&apos;s full timeline —
        onboarding events, entries, trial emails, AI calls, and red flags. Every
        lookup is audited.
      </p>

      <form onSubmit={onSubmit} className="mb-5 flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="email or name…"
          className="flex-1 rounded-lg text-white placeholder:text-white/30"
          style={{
            background: "#0A0A0F",
            border: "1px solid rgba(255,255,255,0.10)",
            padding: "10px 14px",
            fontSize: 14,
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="rounded-lg font-medium text-white disabled:opacity-40"
          style={{
            background: "#8E6FE6",
            padding: "10px 20px",
            fontSize: 14,
            border: "none",
            cursor: searching || !query.trim() ? "default" : "pointer",
          }}
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      {searchError && (
        <p className="mb-4 text-sm" style={{ color: "#F87171" }}>
          {searchError}
        </p>
      )}

      {/* Disambiguation list when search returns multiple users */}
      {results && results.length > 1 && (
        <div
          className="mb-5 rounded-xl"
          style={{
            background: "#0A0A0F",
            border: "1px solid rgba(255,255,255,0.06)",
            overflow: "hidden",
          }}
        >
          <p
            className="uppercase text-white/40"
            style={{
              fontSize: 10,
              letterSpacing: "1.2px",
              padding: "12px 16px 6px",
            }}
          >
            {results.length} matches — pick one
          </p>
          {results.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => {
                setResults(null);
                void loadTimeline(u.id);
              }}
              className="flex w-full items-baseline justify-between text-left hover:bg-white/5"
              style={{
                padding: "10px 16px",
                background: "transparent",
                border: "none",
                borderTop: "1px solid rgba(255,255,255,0.04)",
                cursor: "pointer",
              }}
            >
              <span className="text-white/80" style={{ fontSize: 13 }}>
                {u.name || u.email}
              </span>
              <span className="text-white/40" style={{ fontSize: 12 }}>
                {u.name ? u.email : u.planStatus || u.subscriptionStatus || ""}
              </span>
            </button>
          ))}
        </div>
      )}

      {loadingTimeline && (
        <p className="text-sm text-white/40">Loading timeline…</p>
      )}

      {timelineError && (
        <p className="text-sm" style={{ color: "#F87171" }}>
          {timelineError}
        </p>
      )}

      {timeline && !loadingTimeline && (
        <div>
          <UserHeader user={timeline.user} />
          {events.length === 0 ? (
            <p className="text-sm text-white/40">
              No timeline events for this user.
            </p>
          ) : (
            <div>
              <p
                className="mb-4 uppercase text-white/35"
                style={{ fontSize: 10, letterSpacing: "1.2px" }}
              >
                Timeline · {events.length} events
              </p>
              {events.map((ev, i) => (
                <TimelineRow key={`${ev.type}-${ev.at}-${i}`} event={ev} index={i} />
              ))}
            </div>
          )}
        </div>
      )}
    </ChartCard>
  );
}
