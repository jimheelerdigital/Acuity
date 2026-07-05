"use client";

import { useEffect, useState } from "react";

import { CALENDAR_INTEGRATION_ENABLED } from "@acuity/shared";

import { Card, SectionHeader } from "@/components/acuity";

/**
 * Calendar Integration — /account section. Slice 4 v1.2.
 *
 * Two visual states keyed off `connectedAt`:
 *
 *   - Disconnected: Card with a one-paragraph honesty pitch about
 *     what the connection enables + "Connect Google Calendar →" link.
 *     Clicking navigates to /api/calendar/connect which 302s to
 *     Google's consent screen; on return the callback redirects back
 *     here with ?calendar=<status>.
 *
 *   - Connected: same Card surface, shows the connected email + a
 *     "Last synced" line + Sync now / Disconnect controls. Disconnect
 *     pops a small inline confirmation so the user doesn't blow up
 *     their reflection grounding by accident.
 *
 * Status flash (`?calendar=connected|denied|error|no_token`) renders
 * a subtle line above the controls for a few seconds, then fades.
 * We don't toast — the page reload after Sync/Disconnect is the
 * source of truth.
 *
 * Apple Option-C: this surface lives on web only. Mobile parity in
 * the final slice opens this same page in expo-web-browser, so all
 * payment-adjacent UI stays on the web. No "$" / "Subscribe" tokens
 * appear in this component.
 */

export interface CalendarIntegrationSectionProps {
  connectedEmail: string | null;
  connectedAt: string | null; // ISO
  lastSyncedAt: string | null; // ISO
  statusFlash: string | null; // "connected" | "denied" | "error" | "no_token"
}

const FLASH_TTL_MS = 6000;

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function flashMessage(flash: string): { tone: "ok" | "warn"; text: string } | null {
  switch (flash) {
    case "connected":
      return { tone: "ok", text: "Connected. First sync runs next." };
    case "denied":
      return { tone: "warn", text: "Calendar permission was declined — nothing changed." };
    case "no_token":
      return {
        tone: "warn",
        text: "Google didn't return a refresh token. Try Connect again — sometimes the re-consent screen needs a second pass.",
      };
    case "error":
      return { tone: "warn", text: "Something went wrong on the way back from Google. Try again." };
    default:
      return null;
  }
}

export function CalendarIntegrationSection({
  connectedEmail,
  connectedAt,
  lastSyncedAt,
  statusFlash,
}: CalendarIntegrationSectionProps) {
  const isConnected = Boolean(connectedAt);
  // Kill switch (D1a): block NEW connects only. Already-connected users keep
  // the connected card + Sync + Disconnect. Not-connected users see a
  // disabled "Coming soon" state instead of the connect CTA.
  const showComingSoon = !CALENDAR_INTEGRATION_ENABLED && !isConnected;
  const [flash, setFlash] = useState<string | null>(statusFlash);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), FLASH_TTL_MS);
    return () => clearTimeout(id);
  }, [flash]);

  const flashInfo = flash ? flashMessage(flash) : null;

  const onConnect = () => {
    window.location.href = "/api/calendar/connect";
  };

  const onSyncNow = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/calendar/sync", { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | { ok: boolean; eventsUpserted?: number; error?: string }
        | null;
      if (res.ok && body?.ok) {
        setSyncMessage(
          `Synced ${body.eventsUpserted ?? 0} event${body.eventsUpserted === 1 ? "" : "s"}.`
        );
        // Reload so the Last synced timestamp + any new linkedEventIds
        // on Entry rows show through the server-rendered surfaces.
        setTimeout(() => window.location.reload(), 800);
      } else if (res.status === 429) {
        setSyncMessage("Hold on — only one sync per minute.");
      } else {
        setSyncMessage(
          body?.error === "Reauth"
            ? "Google needs you to reconnect — disconnect and connect again."
            : "Sync didn't go through. Try again in a moment."
        );
      }
    } catch {
      setSyncMessage("Sync didn't go through. Try again in a moment.");
    } finally {
      setSyncing(false);
    }
  };

  const onDisconnect = async () => {
    try {
      await fetch("/api/calendar/disconnect", { method: "POST" });
    } finally {
      window.location.reload();
    }
  };

  return (
    <section className="mb-6">
      <SectionHeader label="Calendar" />
      <h2 className="mt-3 mb-4 font-display text-2xl font-bold tracking-tight text-acuity-text sm:text-3xl">
        Acuity reads your calendar to understand context
      </h2>

      <Card variant="default" radius="xl" padding={6}>
        {showComingSoon ? (
          <>
            <p className="text-[15px] leading-relaxed text-acuity-text-sec">
              Anchor your reflections to what actually happened that day —
              the 3pm meeting, the lunch with your sister, the deadline you
              almost forgot.
            </p>
            <div className="mt-5">
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-acuity-pill border border-acuity-card-border bg-acuity-card-bg-tint px-5 py-2.5 text-[14px] font-semibold text-acuity-text-ter opacity-70"
              >
                Connect Google Calendar
                <span className="rounded-full bg-acuity-card-border px-2 py-0.5 text-[11px] font-medium text-acuity-text-ter">
                  Coming soon
                </span>
              </button>
            </div>
          </>
        ) : !isConnected ? (
          <>
            <p className="text-[15px] leading-relaxed text-acuity-text-sec">
              Connect Google Calendar and reflections get anchored to what
              actually happened that day — the 3pm meeting, the lunch with
              your sister, the deadline you almost forgot. Your past self
              has more to say when the day has shape.
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-acuity-text-ter">
              Read-only. We only see event titles, times, and attendee names
              — never the body of any private invite. Disconnect at any time.
            </p>
            <div className="mt-5">
              <button
                type="button"
                onClick={onConnect}
                className="inline-flex items-center gap-2 rounded-acuity-pill bg-acuity-grad-primary px-5 py-2.5 text-[14px] font-semibold text-white shadow-acuity-glow-primary transition hover:brightness-110 active:scale-[0.98]"
              >
                Connect Google Calendar
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[15px] leading-relaxed text-acuity-text">
              Connected as{" "}
              <span className="font-mono text-acuity-text">
                {connectedEmail ?? "your Google account"}
              </span>
              .
            </p>
            <p className="mt-2 text-[13px] text-acuity-text-ter">
              Last synced {relativeTime(lastSyncedAt)}. Refreshed daily;
              hit Sync now to pull the latest before recording.
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-[14px]">
              <button
                type="button"
                onClick={onSyncNow}
                disabled={syncing}
                className="inline-flex items-center gap-1.5 rounded-acuity-pill border border-acuity-card-border px-4 py-2 font-semibold text-acuity-text transition hover:bg-acuity-card-bg-tint disabled:opacity-60"
              >
                {syncing ? "Syncing…" : "Sync now"}
              </button>
              {!confirmDisconnect ? (
                <button
                  type="button"
                  onClick={() => setConfirmDisconnect(true)}
                  className="inline-flex items-center gap-1.5 rounded-acuity-pill px-4 py-2 font-medium text-acuity-text-ter transition hover:text-acuity-text"
                >
                  Disconnect
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] text-acuity-text-sec">
                    This stops calendar data from informing your reflections.
                    Past entries with linked events keep their connections.
                  </span>
                  <button
                    type="button"
                    onClick={onDisconnect}
                    className="rounded-acuity-pill px-3 py-1.5 text-[13px] font-semibold"
                    style={{ color: "var(--acuity-warn)" }}
                  >
                    Yes, disconnect
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDisconnect(false)}
                    className="rounded-acuity-pill px-3 py-1.5 text-[13px] font-medium text-acuity-text-ter"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
            {syncMessage && (
              <p className="mt-3 text-[13px] text-acuity-text-sec">{syncMessage}</p>
            )}
          </>
        )}

        {flashInfo && (
          <p
            className="mt-4 text-[13px]"
            style={{
              color:
                flashInfo.tone === "ok"
                  ? "var(--acuity-good)"
                  : "var(--acuity-warn)",
            }}
          >
            {flashInfo.text}
          </p>
        )}
      </Card>
    </section>
  );
}
