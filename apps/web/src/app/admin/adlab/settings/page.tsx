"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle, Wifi, Play } from "lucide-react";

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

export default function SettingsPage() {
  const [envStatus, setEnvStatus] = useState<EnvStatus | null>(null);
  const [loadingEnv, setLoadingEnv] = useState(true);
  const [metaResult, setMetaResult] = useState<MetaTestResult | null>(null);
  const [testingMeta, setTestingMeta] = useState(false);
  const [cronResult, setCronResult] = useState<CronResult | null>(null);
  const [runningCron, setRunningCron] = useState(false);

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
