/**
 * Calendar integrations — slice C5b web surface.
 *
 * Three states:
 *   1. FREE post-trial → ProLockedCard (calendar_connect_locked)
 *      Single billing-gate card. CTA opens Safari to /upgrade.
 *
 *   2. PRO/TRIAL/PAST_DUE not yet connected → "Connect on iOS" card
 *      (or, with the calendar_google_direct flag, 2026-10-28, a
 *      "Connect Google Calendar" card that starts the web OAuth flow)
 *      Web is informational only in v1.1 — Phase A connect happens
 *      via iOS EventKit (proxies Google + Outlook + iCloud through
 *      the OS account integration). Web Google OAuth is Phase B.
 *
 *   3. PRO/TRIAL/PAST_DUE already connected → connected-state card
 *      Shows provider, target calendar, autoSendTasks toggle state,
 *      defaultEventDuration. Disconnect is deferred to follow-up
 *      (per scoping doc — not on critical path for v1.1 launch).
 *
 * This is a server component — entitlement + connection state come
 * in as props from /account/page.tsx. No client-side fetch; client
 * bundle stays minimal.
 */

import { CALENDAR_INTEGRATION_ENABLED } from "@acuity/shared";

import { ProLockedCard } from "@/components/pro-locked-card";

import { IntegrationsSettings } from "./integrations-settings";

export interface CalendarConnectionSummary {
  provider: string | null; // "ios_eventkit" | "google" | "outlook" | null
  connectedAt: Date | null;
  targetCalendarId: string | null;
  autoSendTasks: boolean;
  defaultEventDuration: string; // "ALL_DAY" | "TIMED"
}

/** Google Calendar direct sign-in (2026-10-28). */
export interface GoogleDirectSummary {
  /** calendar_google_direct flag on for this person. */
  available: boolean;
  /** Stored connection; status needs_reconnect after Google revoked access. */
  connection: { email: string | null; status: "connected" | "needs_reconnect" } | null;
}

const GOOGLE_START_HREF = "/api/integrations/calendar/google/start";

const GOOGLE_FLASH: Record<string, { tone: "good" | "bad"; text: string }> = {
  connected: { tone: "good", text: "Google Calendar connected. Your tasks with due dates will show up there in a few seconds." },
  denied: { tone: "bad", text: "Google Calendar wasn't connected: access was declined." },
  scope: { tone: "bad", text: "Ripple needs permission to add events. Connect again and leave calendar access ticked." },
  no_token: { tone: "bad", text: "Google didn't finish the connection. Please try again." },
  in_use: { tone: "bad", text: "That Google account is already connected to a different Ripple account." },
  unavailable: { tone: "bad", text: "Google Calendar connect isn't available on your account yet." },
  locked: { tone: "bad", text: "Calendar sync is part of Ripple Pro." },
  error: { tone: "bad", text: "Something went wrong connecting Google Calendar. Please try again." },
};

const PROVIDER_LABEL: Record<string, string> = {
  ios_eventkit: "Apple Calendar (iOS)",
  android_calendar: "Phone calendar (Android)",
  google: "Google Calendar",
  outlook: "Outlook / Microsoft 365",
};

export function IntegrationsSection({
  isProLocked,
  connection,
  googleDirect = { available: false, connection: null },
  googleDirectFlash = null,
}: {
  isProLocked: boolean;
  connection: CalendarConnectionSummary | null;
  googleDirect?: GoogleDirectSummary;
  googleDirectFlash?: string | null;
}) {
  // FREE post-trial: paywall card, no connect surface.
  if (isProLocked) {
    return (
      <section className="mt-8" data-section="integrations">
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Integrations
        </h2>
        <ProLockedCard surfaceId="calendar_connect_locked" />
      </section>
    );
  }

  // PRO/TRIAL/PAST_DUE: connect or connected state.
  const isConnected = !!(connection && connection.provider);

  return (
    <section
      className="mt-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-acuity-card-bg p-6"
      data-section="integrations"
    >
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
        Calendar
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Send Ripple tasks with due dates to your calendar so they show
        up where you already plan your day.
      </p>

      {googleDirectFlash && GOOGLE_FLASH[googleDirectFlash] ? (
        <GoogleFlash flash={GOOGLE_FLASH[googleDirectFlash]} />
      ) : null}

      {/* Kill switch (D1a): not-connected users see "Coming soon"; already-
          connected users keep their connected-state card. Google direct
          sign-in (flag-gated) is offered instead of "Coming soon". */}
      {isConnected ? (
        <ConnectedStateCard
          connection={connection!}
          googleEmail={googleDirect.connection?.email ?? null}
        />
      ) : googleDirect.available ? (
        <GoogleConnectCard needsReconnect={googleDirect.connection?.status === "needs_reconnect"} />
      ) : !CALENDAR_INTEGRATION_ENABLED ? (
        <CalendarComingSoonCard />
      ) : (
        <ConnectOnMobileCard />
      )}
    </section>
  );
}

function CalendarComingSoonCard() {
  return (
    <div className="mt-5 rounded-lg border border-dashed border-zinc-200 dark:border-white/10 p-5 opacity-80">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
          Calendar sync
        </h3>
        <span className="rounded-full bg-zinc-100 dark:bg-white/5 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          Coming soon
        </span>
      </div>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
        Calendar sync is temporarily unavailable while we finish setup. It&apos;ll
        be back shortly — nothing you need to do.
      </p>
    </div>
  );
}

function ConnectOnMobileCard() {
  return (
    <div className="mt-5 rounded-lg border border-dashed border-zinc-200 dark:border-white/10 p-5">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        Connect from the iOS app
      </h3>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
        Ripple reads your Apple Calendar — which already includes any
        Google or Outlook calendars you&apos;ve added on iOS — through
        the system EventKit framework. Open the Ripple iOS app, then
        Profile → Integrations to connect.
      </p>
      <p className="mt-3 text-[11px] text-zinc-400 dark:text-zinc-500">
        Web-side Google OAuth ships post-launch. Outlook follows.
      </p>
    </div>
  );
}

function GoogleFlash({ flash }: { flash: { tone: "good" | "bad"; text: string } }) {
  return (
    <p
      role="status"
      className={
        flash.tone === "good"
          ? "mt-4 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300"
          : "mt-4 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300"
      }
    >
      {flash.text}
    </p>
  );
}

function GoogleConnectCard({ needsReconnect }: { needsReconnect: boolean }) {
  return (
    <div className="mt-5 rounded-lg border border-zinc-200 dark:border-white/10 p-5">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        Google Calendar
      </h3>
      {needsReconnect ? (
        <p className="mt-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Google stopped Ripple&apos;s access to your calendar, so tasks aren&apos;t
          being added. Reconnect to pick up where you left off.
        </p>
      ) : null}
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
        Sign in with Google and Ripple adds your tasks with due dates to your
        primary Google Calendar, from any device, no phone needed. Ripple can
        only add, change and remove the events it creates; it doesn&apos;t
        read your other events.
      </p>
      {/* A plain link, not fetch: the route 302s to Google's consent page. */}
      <a
        href={GOOGLE_START_HREF}
        className="mt-4 inline-flex items-center rounded-md bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {needsReconnect ? "Reconnect Google Calendar" : "Connect Google Calendar"}
      </a>
      <p className="mt-3 text-[11px] text-zinc-400 dark:text-zinc-500">
        Prefer Apple Calendar or your phone&apos;s calendar? Connect from the
        Ripple app: Profile → Integrations.
      </p>
    </div>
  );
}

function ConnectedStateCard({
  connection,
  googleEmail,
}: {
  connection: CalendarConnectionSummary;
  googleEmail: string | null;
}) {
  const provider = connection.provider ?? "unknown";
  const providerLabel = PROVIDER_LABEL[provider] ?? provider;
  const connectedDate = connection.connectedAt
    ? new Date(connection.connectedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  // Server-side narrowing — IntegrationsSettings only accepts the
  // typed Duration union. The server-fetched value is a string, so
  // coerce to the canonical union here (TIMED is the schema default).
  const initialDuration =
    connection.defaultEventDuration === "ALL_DAY" ? "ALL_DAY" : "TIMED";

  return (
    <div className="mt-5 rounded-lg border border-zinc-200 dark:border-white/10 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {providerLabel}
          </h3>
          {connectedDate && (
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Connected {connectedDate}
              {provider === "google" && googleEmail ? ` as ${googleEmail}` : ""}
            </p>
          )}
        </div>
        <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          Connected
        </span>
      </div>

      <IntegrationsSettings
        initialAutoSendTasks={connection.autoSendTasks}
        initialDefaultEventDuration={initialDuration}
        targetCalendarId={connection.targetCalendarId}
        {...(provider === "google"
          ? {
              targetCalendarLabel: "Your primary Google Calendar",
              targetCalendarNote:
                "Disconnecting also removes Ripple's access in your Google account. Events already added stay.",
            }
          : {})}
      />
    </div>
  );
}
