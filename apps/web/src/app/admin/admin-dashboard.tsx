"use client";

import { useCallback, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import TimeRangeSelector, {
  type TimeRange,
  getDateRange,
} from "./components/TimeRangeSelector";

// Lazy-load tab components so only the active tab's code ships
const OverviewTab = dynamic(() => import("./tabs/OverviewTab"));
const UsersTab = dynamic(() => import("./tabs/UsersTab"));
const AdsTab = dynamic(() => import("./tabs/AdsTab"));
const ContentTab = dynamic(() => import("./tabs/ContentTab"));
const AICostsTab = dynamic(() => import("./tabs/AICostsTab"));
const GrowthMetricsTab = dynamic(() => import("./tabs/GrowthMetricsTab"));
const BusinessMetricsTab = dynamic(() => import("./tabs/BusinessMetricsTab"));
const SettingsTab = dynamic(() => import("./tabs/SettingsTab"));
const FunnelAnalyticsTab = dynamic(() => import("./tabs/FunnelAnalyticsTab"));
const MRITab = dynamic(() => import("./tabs/MRITab"));
const FeatureAdoptionTab = dynamic(() => import("./tabs/FeatureAdoptionTab"));
const EngagementDistributionTab = dynamic(
  () => import("./tabs/EngagementDistributionTab")
);

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "mri", label: "🧠 MRI" },
  { key: "funnel-analytics", label: "Funnel" },
  { key: "users", label: "Users" },
  { key: "ads", label: "Ads" },
  { key: "content", label: "Content" },
  { key: "ai-costs", label: "AI Costs" },
  { key: "growth-metrics", label: "Growth" },
  { key: "business-metrics", label: "Business" },
  { key: "feature-adoption", label: "Features" },
  { key: "engagement-distribution", label: "Engagement" },
  { key: "settings", label: "Settings" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// Legacy tab keys redirect to their new merged parents so bookmarks
// and saved URLs from the old 16-tab layout still work.
const LEGACY_REDIRECT: Record<string, TabKey> = {
  growth: "overview",
  engagement: "users",
  revenue: "overview",
  funnel: "funnel-analytics",
  "red-flags": "overview",
  acquisition: "ads",
  "content-factory": "content",
  "auto-blog": "content",
  "feature-flags": "settings",
  "free-cap": "users",
  "trial-emails": "users",
  guide: "settings",
};

// Tabs that don't use the global time range selector
const NO_TIME_RANGE: Set<string> = new Set([
  "users",
  "content",
  "settings",
]);

export default function AdminDashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawTab = searchParams.get("tab") ?? "overview";
  const redirected = LEGACY_REDIRECT[rawTab];
  const tabParam = (redirected ?? rawTab) as TabKey;
  const activeTab = TABS.find((t) => t.key === tabParam)
    ? tabParam
    : "overview";

  const [timeRange, setTimeRange] = useState<TimeRange>(
    (searchParams.get("range") as TimeRange) ?? "7d"
  );
  const [customStart, setCustomStart] = useState(
    searchParams.get("cs") ?? ""
  );
  const [customEnd, setCustomEnd] = useState(
    searchParams.get("ce") ?? ""
  );

  const setTab = useCallback(
    (tab: TabKey) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.push(`/admin?${params.toString()}`);
    },
    [searchParams, router]
  );

  const handleRangeChange = useCallback(
    (range: TimeRange) => {
      setTimeRange(range);
      const params = new URLSearchParams(searchParams.toString());
      params.set("range", range);
      if (range !== "custom") {
        params.delete("cs");
        params.delete("ce");
      }
      router.push(`/admin?${params.toString()}`);
    },
    [searchParams, router]
  );

  const handleCustomChange = useCallback(
    (start: string, end: string) => {
      setCustomStart(start);
      setCustomEnd(end);
      const params = new URLSearchParams(searchParams.toString());
      params.set("cs", start);
      params.set("ce", end);
      router.push(`/admin?${params.toString()}`);
    },
    [searchParams, router]
  );

  const { start, end } = getDateRange(timeRange, customStart, customEnd);
  const startStr = start.toISOString();
  const endStr = end.toISOString();

  const showTimeRange = !NO_TIME_RANGE.has(activeTab);

  return (
    <div className="min-h-screen bg-[#0A0A0F] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto w-full max-w-[1600px]">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1
              className="font-semibold text-white"
              style={{ fontSize: 32, letterSpacing: "-0.4px" }}
            >
              Ripple Admin
            </h1>
          </div>
          {showTimeRange && (
            <TimeRangeSelector
              value={timeRange}
              onChange={handleRangeChange}
              customStart={customStart}
              customEnd={customEnd}
              onCustomChange={handleCustomChange}
            />
          )}
        </div>

        {/* AdLab link */}
        <a
          href="/admin/adlab"
          className="mb-6 flex items-center gap-4 rounded-xl border border-[#8E6FE6]/20 bg-[#8E6FE6]/5 px-5 py-4 transition hover:border-[#8E6FE6]/40 hover:bg-[#8E6FE6]/10 group"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#8E6FE6]/15">
            <svg className="h-5 w-5 text-[#8E6FE6]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
            </svg>
          </div>
          <div>
            <span className="text-sm font-semibold text-white group-hover:text-[#8E6FE6] transition-colors">
              AdLab
            </span>
            <p className="text-xs text-[#A0A0B8]">
              Ad Research & Optimization — angles, creatives, Meta launch, auto-monitoring
            </p>
          </div>
          <svg className="ml-auto h-4 w-4 text-[#A0A0B8] group-hover:text-[#8E6FE6] transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </a>

        {/* Tab bar — horizontal scroll on mobile */}
        <div className="mb-8 flex gap-1 overflow-x-auto rounded-lg bg-[#13131F] p-1 no-scrollbar">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setTab(tab.key)}
              className={`shrink-0 rounded-md px-4 py-2.5 transition ${
                activeTab === tab.key
                  ? "bg-[#8E6FE6] text-white"
                  : "text-white/50 hover:text-white/80"
              }`}
              style={{ fontSize: 15, fontWeight: 500 }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div>
          {activeTab === "overview" && (
            <OverviewTab start={startStr} end={endStr} />
          )}
          {activeTab === "mri" && <MRITab start={startStr} end={endStr} />}
          {activeTab === "users" && <UsersTab />}
          {activeTab === "ads" && (
            <AdsTab start={startStr} end={endStr} />
          )}
          {activeTab === "content" && <ContentTab />}
          {activeTab === "ai-costs" && (
            <AICostsTab start={startStr} end={endStr} />
          )}
          {activeTab === "growth-metrics" && (
            <GrowthMetricsTab start={startStr} end={endStr} />
          )}
          {activeTab === "business-metrics" && (
            <BusinessMetricsTab start={startStr} end={endStr} />
          )}
          {activeTab === "feature-adoption" && (
            <FeatureAdoptionTab start={startStr} end={endStr} />
          )}
          {activeTab === "engagement-distribution" && (
            <EngagementDistributionTab start={startStr} end={endStr} />
          )}
          {activeTab === "funnel-analytics" && (
            <FunnelAnalyticsTab start={startStr} end={endStr} />
          )}
          {activeTab === "settings" && <SettingsTab />}
        </div>
      </div>
    </div>
  );
}
