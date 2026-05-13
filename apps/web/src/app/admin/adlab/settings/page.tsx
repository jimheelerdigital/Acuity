"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle, Wifi, Play, Flame } from "lucide-react";

interface EnvStatus {
  [key: string]: boolean;
}

interface MetaTestResult {
  ok: boolean;
  error?: string;
  account?: {
    name: string;
    status: string;
    currency: string;
    timezone: string;
  };
}

interface CronResult {
  ok: boolean;
  error?: string;
  status?: number;
}

interface WarmupResult {
  done: boolean;
  total: number;
  successes: number;
  failures: number;
  callNum?: number;
  endpoint?: string;
  rateLimited?: boolean;
  message?: string;
}

export default function SettingsPage() {
  const [envStatus, setEnvStatus] = useState<EnvStatus | null>(null);
  const [loadingEnv, setLoadingEnv] = useState(true);
  const [metaResult, setMetaResult] = useState<MetaTestResult | null>(null);
  const [testingMeta, setTestingMeta] = useState(false);
  const [cronResult, setCronResult] = useState<CronResult | null>(null);
  const [runningCron, setRunningCron] = useState(false);
  const [warmupResult, setWarmupResult] = useState<WarmupResult | null>(null);
  const [runningWarmup, setRunningWarmup] = useState(false);

  useEffect(() => {
    fetch("/api/admin/adlab/settings/status")
      .then((r) => r.json())
      .then(setEnvStatus)
      .finally(() => setLoadingEnv(false));
  }, []);

  async function testMeta() {
    setTestingMeta(true);
    setMetaResult(null);
    try {
      const res = await fetch("/api/admin/adlab/settings/test-meta", { method: "POST" });
      setMetaResult(await res.json());
    } catch {
      setMetaResult({ ok: false, error: "Network error" });
    } finally {
      setTestingMeta(false);
    }
  }

  async function runCron() {
    setRunningCron(true);
    setCronResult(null);
    try {
      const res = await fetch("/api/admin/adlab/settings/run-cron", { method: "POST" });
      setCronResult(await res.json());
    } catch {
      setCronResult({ ok: false, error: "Network error" });
    } finally {
      setRunningCron(false);
    }
  }

  async function runWarmup() {
    setRunningWarmup(true);
    setWarmupResult(null);
    try {
      const res = await fetch("/api/admin/adlab/warmup", { method: "POST" });
      if (!res.ok || !res.body) {
        setWarmupResult({ done: true, total: 100, successes: 0, failures: 100 });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.trim()) {
            const parsed: WarmupResult = JSON.parse(line);
            setWarmupResult(parsed);
          }
        }
        if (done) break;
      }
    } catch {
      setWarmupResult({ done: true, total: 100, successes: 0, failures: 100 });
    } finally {
      setRunningWarmup(false);
    }
  }

  const envVars = [
    { key: "META_ACCESS_TOKEN", label: "Meta Access Token" },
    { key: "META_AD_ACCOUNT_ID", label: "Meta Ad Account ID" },
    { key: "META_API_VERSION", label: "Meta API Version" },
    { key: "CRON_SECRET", label: "Cron Secret" },
    { key: "OPENAI_API_KEY", label: "OpenAI API Key" },
    { key: "ANTHROPIC_API_KEY", label: "Anthropic API Key" },
  ];

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
        <p className="text-sm text-[#A0A0B8]">
          Environment status, Meta connection test, and manual cron trigger.
        </p>
      </div>

      <div className="space-y-6">
        {/* Environment Variables */}
        <div className="rounded-xl border border-white/10 bg-[#13131F] p-6">
          <h3 className="text-base font-semibold text-white mb-4">Environment Variables</h3>
          {loadingEnv ? (
            <Loader2 className="h-5 w-5 text-[#A0A0B8] animate-spin" />
          ) : (
            <div className="space-y-2">
              {envVars.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div>
                    <span className="text-sm text-white">{label}</span>
                    <span className="ml-2 text-xs text-[#A0A0B8] font-mono">{key}</span>
                  </div>
                  {envStatus?.[key] ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-400" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Test Meta Connection */}
        <div className="rounded-xl border border-white/10 bg-[#13131F] p-6">
          <h3 className="text-base font-semibold text-white mb-4">Meta API Connection</h3>
          <button
            onClick={testMeta}
            disabled={testingMeta}
            className="inline-flex items-center gap-2 rounded-lg bg-[#7C5CFC] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6B4FE0] transition disabled:opacity-50"
          >
            {testingMeta ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
            Test Meta Connection
          </button>
          {metaResult && (
            <div className={`mt-4 rounded-lg border p-4 text-sm ${
              metaResult.ok
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-red-500/30 bg-red-500/10 text-red-400"
            }`}>
              {metaResult.ok && metaResult.account ? (
                <div className="space-y-1">
                  <p className="font-semibold">Connected successfully</p>
                  <p>Account: {metaResult.account.name}</p>
                  <p>Status: {metaResult.account.status}</p>
                  <p>Currency: {metaResult.account.currency}</p>
                  <p>Timezone: {metaResult.account.timezone}</p>
                </div>
              ) : (
                <p>{metaResult.error || "Connection failed"}</p>
              )}
            </div>
          )}
        </div>

        {/* Warm Up API */}
        <div className="rounded-xl border border-white/10 bg-[#13131F] p-6">
          <h3 className="text-base font-semibold text-white mb-2">API Warm-Up</h3>
          <p className="text-xs text-[#A0A0B8] mb-4">
            Makes 100 successful read calls per run. Takes ~3-4 minutes. Run multiple times with 15 minute gaps to build history.
          </p>
          <button
            onClick={runWarmup}
            disabled={runningWarmup}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 transition disabled:opacity-50"
          >
            {runningWarmup ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
            {runningWarmup ? "Warming Up…" : "Warm Up API"}
          </button>
          {runningWarmup && !warmupResult?.callNum && (
            <p className="mt-3 text-xs text-[#A0A0B8]">Running... this takes ~3-4 minutes</p>
          )}
          {warmupResult && (
            <div className="mt-4 space-y-2">
              {/* Progress bar */}
              {runningWarmup && warmupResult.callNum && (
                <div>
                  <div className="flex justify-between text-xs text-[#A0A0B8] mb-1">
                    <span>Call {warmupResult.callNum} / {warmupResult.total}</span>
                    <span>{Math.round((warmupResult.callNum / warmupResult.total) * 100)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all duration-300"
                      style={{ width: `${(warmupResult.callNum / warmupResult.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              {/* Result summary */}
              {warmupResult.done && (
                <div className={`rounded-lg border p-4 text-sm ${
                  warmupResult.failures === 0
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : warmupResult.successes > 0
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                      : "border-red-500/30 bg-red-500/10 text-red-400"
                }`}>
                  <p className="font-semibold">{warmupResult.rateLimited ? "Rate limited" : "Warm-up complete"}</p>
                  {warmupResult.message && <p>{warmupResult.message}</p>}
                  <p>Total calls: {warmupResult.total}</p>
                  <p>Successes: {warmupResult.successes}</p>
                  <p>Failures: {warmupResult.failures}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Run Cron Manually */}
        <div className="rounded-xl border border-white/10 bg-[#13131F] p-6">
          <h3 className="text-base font-semibold text-white mb-2">Daily Cron</h3>
          <p className="text-xs text-[#A0A0B8] mb-4">
            Manually trigger the daily metrics sync + decision engine. Normally runs at 09:00 UTC.
          </p>
          <button
            onClick={runCron}
            disabled={runningCron}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-[#A0A0B8] hover:text-white hover:border-white/20 transition disabled:opacity-50"
          >
            {runningCron ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run Cron Now
          </button>
          {cronResult && (
            <div className={`mt-4 rounded-lg border p-4 text-sm ${
              cronResult.ok
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-red-500/30 bg-red-500/10 text-red-400"
            }`}>
              {cronResult.ok ? (
                <p>Cron completed successfully (status {cronResult.status})</p>
              ) : (
                <p>{cronResult.error || "Cron failed"}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
