"use client";

import Link from "next/link";
import { useState } from "react";

import type { RoadmapItemDTO, RoadmapStatus } from "@/lib/roadmap";

const COLUMNS: Array<{ status: RoadmapStatus; title: string; blurb: string }> = [
  { status: "building", title: "Building now", blurb: "In progress — landing in the next release or two." },
  { status: "considering", title: "Considering", blurb: "On the list. Your votes decide what moves up." },
  { status: "shipped", title: "Shipped", blurb: "Already in the app." },
];

type Props = { initialItems: RoadmapItemDTO[]; signedIn: boolean };

export function RoadmapBoard({ initialItems, signedIn }: Props) {
  const [items, setItems] = useState(initialItems);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(id: string) {
    if (busy) return;
    setBusy(id);
    setError(null);
    // Optimistic flip; revert on failure.
    const before = items;
    setItems((cur) =>
      cur.map((it) =>
        it.id === id
          ? { ...it, votedByMe: !it.votedByMe, votes: it.votes + (it.votedByMe ? -1 : 1) }
          : it
      )
    );
    try {
      const res = await fetch(`/api/roadmap/${id}/vote`, { method: "POST" });
      if (!res.ok) throw new Error(res.status === 429 ? "Slow down a little — try again in a bit." : "Couldn't save your vote.");
      const body = (await res.json()) as { voted: boolean; votes: number };
      setItems((cur) => cur.map((it) => (it.id === id ? { ...it, votedByMe: body.voted, votes: body.votes } : it)));
    } catch (e) {
      setItems(before);
      setError(e instanceof Error ? e.message : "Couldn't save your vote.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-12">
      {error ? (
        <p className="mb-6 rounded-xl border border-acuity-bad/30 bg-acuity-bad-soft px-4 py-3 text-sm text-acuity-text">
          {error}
        </p>
      ) : null}
      <div className="grid gap-10 md:grid-cols-3 md:gap-6">
        {COLUMNS.map((col) => {
          const rows = items.filter((it) => it.status === col.status);
          return (
            <section key={col.status} aria-labelledby={`col-${col.status}`}>
              <h2 id={`col-${col.status}`} className="text-lg font-semibold">
                {col.title}
              </h2>
              <p className="mt-1 text-sm text-acuity-text-sec">{col.blurb}</p>
              <ul className="mt-5 space-y-3">
                {rows.length === 0 ? (
                  <li className="rounded-2xl border border-dashed border-acuity-card-border px-4 py-6 text-sm text-acuity-text-sec">
                    Nothing here right now.
                  </li>
                ) : null}
                {rows.map((it) => (
                  <li
                    key={it.id}
                    className="rounded-2xl border border-acuity-card-border bg-acuity-card-bg p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium leading-snug">{it.title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-acuity-text-sec">{it.summary}</p>
                        {it.status === "shipped" && it.shippedVersion ? (
                          <p className="mt-2 text-xs font-medium text-acuity-good">
                            Shipped in {it.shippedVersion}
                          </p>
                        ) : null}
                      </div>
                      {it.status !== "shipped" ? (
                        <VoteButton
                          item={it}
                          signedIn={signedIn}
                          pending={busy === it.id}
                          onToggle={() => void toggle(it.id)}
                        />
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <SuggestIdea signedIn={signedIn} />
    </div>
  );
}

function VoteButton({
  item,
  signedIn,
  pending,
  onToggle,
}: {
  item: RoadmapItemDTO;
  signedIn: boolean;
  pending: boolean;
  onToggle: () => void;
}) {
  const base =
    "flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border text-xs font-semibold transition";
  const style = item.votedByMe
    ? "border-acuity-primary bg-acuity-primary-soft text-acuity-primary"
    : "border-acuity-card-border text-acuity-text-sec hover:border-acuity-primary hover:text-acuity-text";
  if (!signedIn) {
    return (
      <Link
        href="/auth/signin?callbackUrl=/roadmap"
        className={`${base} ${style}`}
        aria-label={`Sign in to vote for ${item.title}`}
      >
        <span aria-hidden>▲</span>
        <span>{item.votes}</span>
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      aria-pressed={item.votedByMe}
      aria-label={`${item.votedByMe ? "Remove vote for" : "Vote for"} ${item.title}`}
      className={`${base} ${style} disabled:opacity-60`}
    >
      <span aria-hidden>▲</span>
      <span>{item.votes}</span>
    </button>
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
      // Same funnel as in-app feedback: Slack #acuity-feedback → Make → Monday.
      const res = await fetch("/api/feedback/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: `[roadmap idea] ${trimmed}`, type: "feature", osName: "web" }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState("sent");
      setText("");
    } catch {
      setState("error");
    }
  }

  return (
    <section className="mt-16 rounded-3xl border border-acuity-card-border bg-acuity-card-bg p-6 sm:p-8">
      <h2 className="text-xl font-semibold">Have an idea?</h2>
      <p className="mt-2 text-sm text-acuity-text-sec">
        Tell us what would make Ripple more useful. Every suggestion is read by the people building it;
        the good ones show up in Considering with your fellow users voting on them.
      </p>
      {!signedIn ? (
        <p className="mt-4 text-sm">
          <Link href="/auth/signin?callbackUrl=/roadmap" className="text-acuity-primary underline-offset-4 hover:underline">
            Sign in
          </Link>{" "}
          to suggest an idea.
        </p>
      ) : state === "sent" ? (
        <p className="mt-4 text-sm font-medium text-acuity-good">Got it — thank you.</p>
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
              {state === "error" ? "Couldn't send that — try again." : `${trimmed.length} / 4000`}
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
