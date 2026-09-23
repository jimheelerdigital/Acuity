"use client";

/**
 * Sunday batch review screen (2026-09-23, per Keenan).
 *
 * Shows the latest awaiting-approval Reddit-grounded batch per audience
 * group (women / men). Keenan approves the ads he likes, sets the daily
 * budget and destination (his own funnel URLs or App Store), and hits
 * "Launch approved" — the ONLY action that creates + activates a real
 * Meta campaign (PATCH settings → POST /ads/launch → POST /ads/activate).
 */

import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Rocket,
  ImageOff,
} from "lucide-react";

interface Creative {
  id: string;
  headline: string;
  primaryText: string;
  description: string;
  cta: string;
  imageUrl: string | null;
  complianceStatus: string;
  complianceNotes: string | null;
  approved: boolean;
}

interface Angle {
  id: string;
  researchNotes: string | null;
  valueSurface: string;
  creatives: Creative[];
}

interface Experiment {
  id: string;
  topicBrief: string;
  status: string;
  createdAt: string;
  metaCampaignId: string | null;
  adSetDailyBudgetCents: number | null;
  destination: string;
  destinationUrl: string | null;
  campaignType: string | null;
  angles: Angle[];
}

interface Group {
  groupKey: "women" | "men";
  projectName: string;
  defaultBudgetCents?: number;
  /** Fixed daily budget of the group's evergreen ad set (website launches). */
  evergreenBudgetCents?: number;
  experiment: Experiment | null;
}

type DestinationChoice = "custom_url" | "app_install" | "direct_funnel";

const COMPLIANCE_BADGE: Record<string, { cls: string; label: string }> = {
  passed: { cls: "bg-acuity-good-soft text-acuity-good", label: "Pass" },
  flagged: { cls: "bg-acuity-warn-soft text-acuity-warn", label: "Warning" },
  failed: { cls: "bg-acuity-bad-soft text-acuity-bad", label: "Fail" },
  pending: { cls: "bg-zinc-500/20 text-zinc-400", label: "Pending" },
};

export default function ReviewPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch("/api/admin/adlab/review")
      .then((r) => r.json())
      .then((d) => setGroups(d.groups ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Weekly Batch Review</h1>
        <p className="text-sm text-acuity-text-ter">
          Reddit-grounded ads generated every Sunday. Approve the ones you like, set budget
          and destination per group, then launch. Nothing spends money until you hit Launch.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 text-acuity-text-ter animate-spin" />
        </div>
      ) : (
        <div className="space-y-10">
          {groups.map((group) => (
            <GroupSection key={group.groupKey} group={group} onLaunched={load} />
          ))}
        </div>
      )}
    </>
  );
}

function GroupSection({ group, onLaunched }: { group: Group; onLaunched: () => void }) {
  const exp = group.experiment;
  const [creatives, setCreatives] = useState<Map<string, boolean>>(
    () =>
      new Map(
        exp?.angles.flatMap((a) => a.creatives.map((c) => [c.id, c.approved] as [string, boolean])) ?? []
      )
  );
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [budgetDollars, setBudgetDollars] = useState<string>(() =>
    (((exp?.adSetDailyBudgetCents ?? group.defaultBudgetCents ?? 1000) / 100)).toFixed(2)
  );
  const [destination, setDestination] = useState<DestinationChoice>(() => {
    if (exp?.campaignType === "app_install") return "app_install";
    if (exp?.destination === "custom_url") return "custom_url";
    return "custom_url"; // Keenan's default: his own funnels
  });
  const [customUrl, setCustomUrl] = useState<string>(
    exp?.destinationUrl ??
      (group.groupKey === "men" ? "https://goripple.io/start-bwk" : "https://goripple.io/start")
  );

  const [launching, setLaunching] = useState(false);
  const [launchStep, setLaunchStep] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launchDone, setLaunchDone] = useState(false);

  if (!exp) {
    return (
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">{group.projectName}</h2>
        <div className="rounded-acuity-lg border border-dashed border-acuity-line-strong bg-acuity-card-bg p-10 text-center">
          <p className="text-sm text-acuity-text-ter">
            No batch awaiting review. The next one generates Sunday morning.
          </p>
        </div>
      </section>
    );
  }

  const allCreatives = exp.angles.flatMap((a) =>
    a.creatives.map((c) => ({ ...c, theme: a.researchNotes, valueSurface: a.valueSurface }))
  );
  const approvedCount = allCreatives.filter(
    (c) => creatives.get(c.id) && c.complianceStatus !== "failed"
  ).length;

  async function toggleApproved(creativeId: string) {
    const next = !creatives.get(creativeId);
    setTogglingId(creativeId);
    try {
      const res = await fetch(`/api/admin/adlab/creatives/${creativeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: next }),
      });
      if (res.ok) {
        setCreatives((prev) => new Map(prev).set(creativeId, next));
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error || "Failed to update approval");
      }
    } catch {
      alert("Network error updating approval");
    }
    setTogglingId(null);
  }

  // Website launches add ads to the group's always-on ad set, whose budget
  // is fixed in code — only App Store launches still take a budget here.
  const evergreen = destination !== "app_install" && !!group.evergreenBudgetCents;

  async function launchApproved() {
    if (!exp) return;
    setLaunchError(null);

    const budgetCents = evergreen
      ? group.evergreenBudgetCents!
      : Math.round(parseFloat(budgetDollars) * 100);
    if (!Number.isFinite(budgetCents) || budgetCents < 100) {
      setLaunchError("Daily budget must be at least $1.00");
      return;
    }
    if (destination === "custom_url") {
      try {
        const u = new URL(customUrl);
        if (!["http:", "https:"].includes(u.protocol)) throw new Error();
      } catch {
        setLaunchError("Enter a valid funnel URL (https://...)");
        return;
      }
    }
    if (approvedCount === 0) {
      setLaunchError("Approve at least one ad first");
      return;
    }

    const destLabel =
      destination === "app_install"
        ? "the App Store (app installs)"
        : destination === "custom_url"
          ? customUrl
          : "the /start direct funnel";
    if (
      !confirm(
        evergreen
          ? `Add ${approvedCount} ad(s) LIVE to the always-on ${group.projectName} campaign?\n\nShared daily budget: $${(budgetCents / 100).toFixed(2)} (fixed — this does not add spend)\nOptimizing for: signups\nDestination: ${destLabel}\n\nThe weakest live ads are paused so the ad set stays at 8 or fewer. New ads start spending immediately.`
          : `Launch ${approvedCount} ad(s) LIVE for ${group.projectName}?\n\nDaily budget: $${(budgetCents / 100).toFixed(2)}\nDestination: ${destLabel}\n\nThis creates the Meta campaign and activates it immediately — it will start spending.`
      )
    ) {
      return;
    }

    setLaunching(true);
    try {
      // 1. Save launch settings
      setLaunchStep("Saving settings...");
      const patchRes = await fetch(`/api/admin/adlab/experiments/${exp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adSetDailyBudgetCents: budgetCents,
          campaignType: destination === "app_install" ? "app_install" : "website",
          destination: destination === "app_install" ? exp.destination : destination,
          ...(destination === "custom_url" ? { destinationUrl: customUrl } : {}),
        }),
      });
      if (!patchRes.ok) {
        const d = await patchRes.json().catch(() => ({}));
        throw new Error(d.error || "Failed to save settings");
      }

      // 2. Create campaign + ad set + ads (PAUSED)
      setLaunchStep("Creating campaign on Meta (paused)...");
      const launchRes = await fetch("/api/admin/adlab/ads/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experimentId: exp.id }),
      });
      const launchData = await launchRes.json().catch(() => ({}));
      if (!launchRes.ok) {
        throw new Error(launchData.error || "Campaign creation failed");
      }
      if (launchData.errors?.length > 0) {
        console.warn("[review] partial launch errors:", launchData.errors);
      }

      // 3. Activate — this is the money moment
      setLaunchStep("Activating campaign...");
      const activateRes = await fetch("/api/admin/adlab/ads/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experimentId: exp.id }),
      });
      const activateData = await activateRes.json().catch(() => ({}));
      if (!activateRes.ok) {
        throw new Error(
          (activateData.error || "Activation failed") +
            " — the campaign exists on Meta but is PAUSED. Check the experiment page."
        );
      }

      setLaunchStep(null);
      setLaunchDone(true);
      setTimeout(onLaunched, 1500);
    } catch (err) {
      setLaunchStep(null);
      setLaunchError(err instanceof Error ? err.message : String(err));
    }
    setLaunching(false);
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{group.projectName}</h2>
          <p className="text-xs text-acuity-text-ter mt-0.5">{exp.topicBrief}</p>
        </div>
        <span className="text-xs text-acuity-text-ter shrink-0">
          {approvedCount}/{allCreatives.length} approved
        </span>
      </div>

      {/* Ad cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        {allCreatives.map((c) => {
          const approved = creatives.get(c.id) ?? false;
          const badge = COMPLIANCE_BADGE[c.complianceStatus] ?? COMPLIANCE_BADGE.pending;
          const isFail = c.complianceStatus === "failed";
          return (
            <div
              key={c.id}
              className={`rounded-acuity-lg border bg-acuity-card-bg overflow-hidden transition ${
                approved && !isFail
                  ? "border-acuity-good"
                  : "border-acuity-line"
              } ${isFail ? "opacity-60" : ""}`}
            >
              <div className="flex">
                <div className="w-28 h-28 shrink-0 bg-acuity-bg-inset flex items-center justify-center">
                  {c.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.imageUrl} alt={c.headline} className="w-28 h-28 object-cover" />
                  ) : (
                    <ImageOff className="h-6 w-6 text-acuity-text-ter" />
                  )}
                </div>
                <div className="flex-1 min-w-0 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`rounded-acuity-pill px-2 py-0.5 text-[10px] font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                    <span className="text-[10px] text-acuity-text-ter uppercase tracking-wide">
                      {c.valueSurface.replace("_", " ")}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-white truncate">{c.headline}</p>
                  <p className="text-xs text-acuity-text-sec mt-0.5 line-clamp-2">{c.primaryText}</p>
                  {c.theme && (
                    <p className="text-[10px] text-acuity-text-ter mt-1 line-clamp-1">{c.theme}</p>
                  )}
                </div>
              </div>
              {c.complianceNotes && c.complianceStatus !== "passed" && (
                <div className="px-3 pb-2">
                  <p className="text-[10px] text-acuity-warn line-clamp-2 whitespace-pre-line">
                    {c.complianceNotes}
                  </p>
                </div>
              )}
              <div className="border-t border-acuity-line px-3 py-2 flex items-center justify-between">
                <span className="text-[10px] text-acuity-text-ter">CTA: {c.cta.replace(/_/g, " ")}</span>
                <button
                  onClick={() => toggleApproved(c.id)}
                  disabled={togglingId === c.id || isFail || launching}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition disabled:opacity-50 ${
                    approved
                      ? "bg-acuity-good-soft text-acuity-good"
                      : "bg-acuity-bg-inset text-acuity-text-ter hover:text-white"
                  }`}
                  title={isFail ? "Failed compliance — cannot approve" : undefined}
                >
                  {togglingId === c.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : approved ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : null}
                  {isFail ? "Blocked" : approved ? "Approved" : "Approve"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Launch controls */}
      <div className="rounded-acuity-lg border border-acuity-line bg-acuity-card-bg p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-[11px] text-acuity-text-ter mb-1">Daily budget ($/day)</label>
            {evergreen ? (
              <p className="py-2 text-sm text-white">
                ${(group.evergreenBudgetCents! / 100).toFixed(0)}/day{" "}
                <span className="text-acuity-text-ter">shared, always-on · optimizes for signups</span>
              </p>
            ) : (
            <input
              type="number"
              min="1"
              step="0.01"
              value={budgetDollars}
              onChange={(e) => setBudgetDollars(e.target.value)}
              disabled={launching}
              className="w-28 rounded-lg border border-acuity-line bg-acuity-bg-inset px-3 py-2 text-sm text-white focus:border-acuity-primary focus:outline-none"
            />
            )}
          </div>
          <div>
            <label className="block text-[11px] text-acuity-text-ter mb-1">Destination</label>
            <select
              value={destination}
              onChange={(e) => setDestination(e.target.value as DestinationChoice)}
              disabled={launching}
              className="rounded-lg border border-acuity-line bg-acuity-bg-inset px-3 py-2 text-sm text-white focus:border-acuity-primary focus:outline-none"
            >
              <option value="custom_url">My funnel (custom URL)</option>
              <option value="app_install">App Store (app installs)</option>
              <option value="direct_funnel">Direct funnel (/start)</option>
            </select>
          </div>
          {destination === "custom_url" && (
            <div className="flex-1 min-w-[240px]">
              <label className="block text-[11px] text-acuity-text-ter mb-1">Funnel URL</label>
              <input
                type="url"
                placeholder="https://..."
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                disabled={launching}
                className="w-full rounded-lg border border-acuity-line bg-acuity-bg-inset px-3 py-2 text-sm text-white focus:border-acuity-primary focus:outline-none"
              />
            </div>
          )}
          <button
            onClick={launchApproved}
            disabled={launching || launchDone || approvedCount === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-acuity-primary px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {launching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="h-4 w-4" />
            )}
            {launchDone ? "Live!" : `Launch ${approvedCount} approved`}
          </button>
        </div>

        {launchStep && (
          <p className="mt-3 text-xs text-acuity-text-sec flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" /> {launchStep}
          </p>
        )}
        {launchError && (
          <p className="mt-3 text-xs text-acuity-bad flex items-start gap-1.5">
            <XCircle className="h-3.5 w-3.5 shrink-0 mt-px" /> {launchError}
          </p>
        )}
        {launchDone && (
          <p className="mt-3 text-xs text-acuity-good flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" /> Campaign is live on Meta.
          </p>
        )}
        {!launching && !launchDone && (
          <p className="mt-3 text-[11px] text-acuity-text-ter flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" />
            Launch creates the campaign and activates it immediately — spend starts right away.
          </p>
        )}
      </div>
    </section>
  );
}
