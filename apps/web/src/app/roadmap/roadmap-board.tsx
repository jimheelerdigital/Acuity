"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ROADMAP_STATUS_META, roadmapVotingOpen, type RoadmapStatus } from "@acuity/shared";

import type { RoadmapItemDTO } from "@/lib/roadmap";

import { CategoryBanner, StatusPill, VoteButton, categoryLabel, contextLine } from "./roadmap-ui";

/**
 * Tabbed roadmap board (2026-10-19, modelled on the LeanIX roadmap Jimmy
 * pointed at): one tab per status, a card grid with a category banner,
 * and every card opens /roadmap/[id]. Voting stays on the card.
 */

const TABS: RoadmapStatus[] = ["building", "planned", "considering", "shipped"];

type Props = { initialItems: RoadmapItemDTO[]; signedIn: boolean; initialTab?: RoadmapStatus };

export function RoadmapBoard({ initialItems, signedIn, initialTab }: Props) {
  const counts = useMemo(() => {
    const c: Record<RoadmapStatus, number> = { building: 0, planned: 0, considering: 0, shipped: 0 };
    for (const it of initialItems) c[it.status] += 1;
    return c;
  }, [initialItems]);
  // Open on the requested tab, else the first one with anything in it.
  const [tab, setTab] = useState<RoadmapStatus>(
    initialTab ?? TABS.find((t) => counts[t] > 0) ?? "building"
  );
  const rows = initialItems.filter((it) => it.status === tab);

  function select(next: RoadmapStatus) {
    setTab(next);
    // Shareable/back-button friendly without a navigation.
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
  }

  return (
    <div className="mt-10">
      <div role="tablist" aria-label="Roadmap status" className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const active = t === tab;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="roadmap-panel"
              onClick={() => select(t)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                active
                  ? "border-acuity-primary bg-acuity-primary text-white"
                  : "border-acuity-card-border text-acuity-text-sec hover:text-acuity-text"
              }`}
            >
              {ROADMAP_STATUS_META[t].tab}
              <span className={`ml-2 tabular-nums ${active ? "text-white/80" : "text-acuity-text-quiet"}`}>{counts[t]}</span>
            </button>
          );
        })}
      </div>

      <div id="roadmap-panel" role="tabpanel" className="mt-6">
        <p className="text-sm text-acuity-text-sec">{ROADMAP_STATUS_META[tab].blurb}</p>
        {rows.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-acuity-card-border px-4 py-8 text-center text-sm text-acuity-text-sec">
            Nothing here right now.
          </p>
        ) : (
          <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((it) => (
              <RoadmapCard key={it.id} item={it} signedIn={signedIn} />
            ))}
          </ul>
        )}
      </div>

      <SuggestIdea signedIn={signedIn} />
    </div>
  );
}

function RoadmapCard({ item, signedIn }: { item: RoadmapItemDTO; signedIn: boolean }) {
  const href = `/roadmap/${item.id}`;
  const context = contextLine(item);
  const cat = categoryLabel(item.category);
  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-acuity-card-border bg-acuity-card-bg transition hover:border-acuity-primary/60">
      <Link href={href} className="flex flex-1 flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-acuity-primary">
        <CategoryBanner category={item.category} />
        <div className="flex flex-1 flex-col p-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={item.status} />
            {cat ? <span className="text-xs text-acuity-text-quiet">{cat}</span> : null}
          </div>
          <h3 className="mt-3 font-semibold leading-snug">{item.title}</h3>
          <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-acuity-text-sec">{item.summary}</p>
          {context ? <p className="mt-3 text-xs font-medium text-acuity-text-sec">{context}</p> : null}
        </div>
      </Link>
      <div className="flex items-center justify-between gap-3 border-t border-acuity-card-border px-4 py-3">
        {roadmapVotingOpen(item.status) ? (
          <VoteButton item={item} signedIn={signedIn} returnTo={`/roadmap?tab=${item.status}`} />
        ) : (
          <span className="text-xs font-medium text-acuity-good">In the app</span>
        )}
        <Link href={href} className="text-sm font-medium text-acuity-primary underline-offset-4 hover:underline">
          {item.status === "shipped" ? "What changed →" : "Learn more →"}
        </Link>
      </div>
    </li>
  );
}

function SuggestIdea({ signedIn }: { signedIn: boolean }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const trimmed = text.trim();
  const canSend = trimmed.length >= 10 && trimmed.length <= 4000 && state !== "sending";

  async function send() {
    if (!canSend) return;
    setState("sending");
    try {
      // Same funnel as in-app feedback: stored in Feedback, alerted to Slack #acuity-feedback.
      const res = await fetch("/api/feedback/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: `[roadmap idea] ${trimmed}`, type: "feature", osName: "web", source: "roadmap" }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState("sent");
      setText("");
    } catch {
      setState("error");
    }
  }

  return (
    <section id="suggest" className="mt-16 rounded-3xl border border-acuity-card-border bg-acuity-card-bg p-6 sm:p-8">
      <h2 className="text-xl font-semibold">Have an idea?</h2>
      <p className="mt-2 text-sm text-acuity-text-sec">
        Tell us what would make Ripple more useful. The people building it read every suggestion,
        and the good ones show up under Vote for everyone to weigh in on.
      </p>
      {!signedIn ? (
        <p className="mt-4 text-sm">
          <Link href="/auth/signin?callbackUrl=/roadmap%23suggest" className="text-acuity-primary underline-offset-4 hover:underline">
            Sign in
          </Link>{" "}
          to suggest an idea.
        </p>
      ) : state === "sent" ? (
        <p className="mt-4 text-sm font-medium text-acuity-good">Got it, thank you.</p>
      ) : (
        <div className="mt-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder="I wish Ripple could…"
            className="w-full rounded-2xl border border-acuity-card-border bg-acuity-bg px-4 py-3 text-sm text-acuity-text placeholder:text-acuity-text-sec focus:border-acuity-primary focus:outline-none"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-acuity-text-sec">
              {state === "error" ? "Couldn't send that. Try again." : `${trimmed.length} / 4000`}
            </span>
            <button
              type="button"
              onClick={() => void send()}
              disabled={!canSend}
              className="rounded-xl bg-acuity-primary px-5 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50"
            >
              {state === "sending" ? "Sending…" : "Send idea"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
