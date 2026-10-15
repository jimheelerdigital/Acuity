"use client";

import { useState } from "react";

import { Button } from "@/components/acuity";

/**
 * Approve / Cancel for the consent screen. Posts the signed ticket to
 * /api/oauth/authorize and then navigates to the client's redirect URL.
 * (A plain form POST → 302 would be blocked by our CSP form-action, which
 * Chrome enforces on redirect targets; a scripted navigation is not.)
 */
export function ConsentButtons({
  ticket,
  canApprove,
  appName,
}: {
  ticket: string;
  canApprove: boolean;
  appName: string;
}) {
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approve" | "deny") {
    setBusy(decision);
    setError(null);
    try {
      const res = await fetch("/api/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket, decision }),
      });
      const body = (await res.json().catch(() => ({}))) as { redirectTo?: string; message?: string };
      if (res.ok && body.redirectTo) {
        window.location.assign(body.redirectTo);
        return;
      }
      setError(body.message ?? `Something went wrong (${res.status}). Reload and try again.`);
    } catch {
      setError("Couldn't reach Ripple. Check your connection and try again.");
    }
    setBusy(null);
  }

  return (
    <div className="mt-6">
      <div className="flex gap-3">
        {canApprove && (
          <Button variant="primary" onClick={() => decide("approve")} disabled={busy !== null}>
            {busy === "approve" ? "Connecting…" : `Allow ${appName}`}
          </Button>
        )}
        <Button variant="ghost" onClick={() => decide("deny")} disabled={busy !== null}>
          {busy === "deny" ? "Cancelling…" : "Cancel"}
        </Button>
      </div>
      {error && <p className="mt-3 text-sm text-acuity-bad">{error}</p>}
    </div>
  );
}
