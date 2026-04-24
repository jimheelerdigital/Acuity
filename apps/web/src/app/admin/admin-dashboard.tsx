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
const GrowthTab = dynamic(() => import("./tabs/GrowthTab"));
const EngagementTab = dynamic(() => import("./tabs/EngagementTab"));
const RevenueTab = dynamic(() => import("./tabs/RevenueTab"));
const FunnelTab = dynamic(() => import("./tabs/FunnelTab"));
const AdsTab = dynamic(() => import("./tabs/AdsTab"));
const AICostsTab = dynamic(() => import("./tabs/AICostsTab"));
const ContentFactoryTab = dynamic(() => import("./tabs/ContentFactoryTab"));
const RedFlagsTab = dynamic(() => import("./tabs/RedFlagsTab"));
const FeatureFlagsTab = dynamic(() => import("./tabs/FeatureFlagsTab"));
const UsersTab = dynamic(() => import("./tabs/UsersTab"));
const TrialEmailsTab = dynamic(() => import("./tabs/TrialEmailsTab"));
const GuideTab = dynamic(() => import("./tabs/GuideTab"));

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "growth", label: "Growth" },
  { key: "engagement", label: "Engagement" },
  { key: "revenue", label: "Revenue" },
  { key: "funnel", label: "Funnel" },
  { key: "ads", label: "Ads" },
  { key: "ai-costs", label: "AI Costs" },
  { key: "content-factory", label: "Content Factory" },
  { key: "red-flags", label: "Red Flags" },
  { key: "feature-flags", label: "Feature Flags" },
  { key: "users", label: "Users" },
  { key: "trial-emails", label: "Trial Emails" },
  { key: "guide", label: "Guide" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const QUICK_LINKS = [
  { label: "Supabase", href: "https://supabase.com/dashboard" },
  { label: "Vercel", href: "https://vercel.com" },
  { label: "GA4", href: "https://analytics.google.com" },
  { label: "Stripe", href: "https://dashboard.stripe.com" },
  { label: "Resend", href: "https://resend.com/emails" },
  { label: "Meta Ads", href: "https://adsmanager.facebook.com" },
  { label: "Inngest", href: "https://app.inngest.com" },
];

export default function AdminDashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const tabParam = (searchParams.get("tab") ?? "overview") as TabKey;
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

  const showTimeRange =
    activeTab !== "content-factory" &&
    activeTab !== "feature-flags" &&
    activeTab !== "users" &&
    activeTab !== "trial-emails" &&
    activeTab !== "guide";

  return (
    <div className="min-h-screen bg-[#0A0A0F] px-4 py-6 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Acuity Admin</h1>
            <div className="mt-1 flex flex-wrap gap-2">
              {QUICK_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-white/25 hover:text-[#7C5CFC] transition"
                >
                  {link.label}
                </a>
              ))}
            </div>
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

        {/* Tab bar — horizontal scroll on mobile */}
        <div className="mb-6 flex gap-1 overflow-x-auto rounded-lg bg-[#13131F] p-1 no-scrollbar">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setTab(tab.key)}
              className={`shrink-0 rounded-md px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.key
                  ? "bg-[#7C5CFC] text-white"
                  : "text-white/40 hover:text-white/70"
              }`}
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
          {activeTab === "growth" && (
            <GrowthTab start={startStr} end={endStr} />
          )}
          {activeTab === "engagement" && (
            <EngagementTab start={startStr} end={endStr} />
          )}
          {activeTab === "revenue" && (
            <RevenueTab start={startStr} end={endStr} />
          )}
          {activeTab === "funnel" && (
            <FunnelTab start={startStr} end={endStr} />
          )}
          {activeTab === "ads" && (
            <AdsTab start={startStr} end={endStr} />
          )}
          {activeTab === "ai-costs" && (
            <AICostsTab start={startStr} end={endStr} />
          )}
          {activeTab === "content-factory" && <ContentFactoryTab />}
          {activeTab === "red-flags" && (
            <RedFlagsTab start={startStr} end={endStr} />
          )}
          {activeTab === "feature-flags" && <FeatureFlagsTab />}
          {activeTab === "users" && <UsersTab />}
          {activeTab === "trial-emails" && <TrialEmailsTab />}
          {activeTab === "guide" && <GuideTab />}
        </div>
      </div>
    </div>
  );
}
