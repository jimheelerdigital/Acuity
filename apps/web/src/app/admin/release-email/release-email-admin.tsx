"use client";

import { useState } from "react";

type Mode = "dry-run" | "test" | "live";
type Result = Record<string, unknown> & { error?: string };

const LABELS: Record<string, string> = {
  appStoreVersion: "App Store is serving",
  releaseGateOpen: "Live send allowed",
  audience: "Audience",
  alreadySent: "Already sent",
  toSend: "Will send to",
  suppressedExcluded: "Left out (bounced/complained)",
  sentTo: "Test sent to",
  sent: "Sent",
  skipped: "Skipped (already claimed)",
  failed: "Failed",
  remaining: "Remaining (click Send live again)",
};

export function ReleaseEmailAdmin({
  versions,
}: {
  versions: { version: string; platform: string }[];
}) {
  const [version, setVersion] = useState(versions[0]?.version ?? "");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<Mode | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function run(mode: Mode) {
    setBusy(mode);
    setResult(null);
    try {
      const res = await fetch("/api/admin/release-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version, mode, confirm }),
      });
      const json = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as Result;
      setResult(res.ok ? json : { ...json, error: json.error ?? `HTTP ${res.status}` });
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setBusy(null);
    }
  }

  const confirmPhrase = `SEND ${version}`;
  const btn =
    "rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <section className="mt-6 space-y-5">
      <label className="block text-sm">
        <span className="text-acuity-text-sec">Release</span>
        <select
          className="mt-1 block w-full rounded-md border border-acuity-line bg-transparent px-3 py-2"
          value={version}
          onChange={(e) => {
            setVersion(e.target.value);
            setConfirm("");
            setResult(null);
          }}
        >
          {versions.map((v) => (
            <option key={v.version} value={v.version}>
              {v.version} ({v.platform})
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-3">
        <button className={`${btn} border border-acuity-line`} disabled={!!busy} onClick={() => run("dry-run")}>
          {busy === "dry-run" ? "Checking…" : "1. Check audience"}
        </button>
        <button className={`${btn} border border-acuity-line`} disabled={!!busy} onClick={() => run("test")}>
          {busy === "test" ? "Sending…" : "2. Send me a test"}
        </button>
      </div>

      <div className="rounded-md border border-acuity-line p-4">
        <p className="text-sm">
          3. Send live. Type <code className="font-mono">{confirmPhrase}</code> to enable.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <input
            className="w-56 rounded-md border border-acuity-line bg-transparent px-3 py-2 font-mono text-sm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={confirmPhrase}
          />
          <button
            className={`${btn} bg-acuity-primary text-white`}
            disabled={!!busy || confirm !== confirmPhrase}
            onClick={() => run("live")}
          >
            {busy === "live" ? "Sending… (up to ~2 min)" : "Send live"}
          </button>
        </div>
      </div>

      {result && (
        <div className="rounded-md border border-acuity-line p-4 text-sm">
          {result.error ? (
            <p className="text-red-400">{result.error}</p>
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
              {Object.entries(LABELS)
                .filter(([k]) => k in result)
                .map(([k, label]) => (
                  <div key={k} className="contents">
                    <dt className="text-acuity-text-sec">{label}</dt>
                    <dd>{String(result[k] ?? "—")}</dd>
                  </div>
                ))}
            </dl>
          )}
        </div>
      )}
    </section>
  );
}
