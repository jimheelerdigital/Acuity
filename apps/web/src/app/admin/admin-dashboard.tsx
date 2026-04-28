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
const AutoBlogTab = dynamic(() => import("./tabs/AutoBlogTab"));
const AcquisitionTab = dynamic(() => import("./tabs/AcquisitionTab"));

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "growth", label: "Growth" },
  { key: "engagement", label: "Engagement" },
  { key: "revenue", label: "Revenue" },
  { key: "funnel", label: "Funnel" },
  { key: "ads", label: "Ads" },
  { key: "acquisition", label: "Acquisition" },
  { key: "ai-costs", label: "AI Costs" },
  { key: "content-factory", label: "Content Factory" },
  { key: "auto-blog", label: "Auto Blog" },
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
    activeTab !== "auto-blog" &&
    activeTab !== "acquisition" &&
    activeTab !== "feature-flags" &&
    activeTab !== "users" &&
    activeTab !== "trial-emails" &&
    activeTab !== "guide";

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
              Acuity Admin
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
              {QUICK_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/55 hover:text-[#A78BFA] transition"
                  style={{ fontSize: 13 }}
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
        <div className="mb-8 flex gap-1 overflow-x-auto rounded-lg bg-[#13131F] p-1 no-scrollbar">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setTab(tab.key)}
              className={`shrink-0 rounded-md px-4 py-2.5 transition ${
                activeTab === tab.key
                  ? "bg-[#7C5CFC] text-white"
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
          {activeTab === "auto-blog" && <AutoBlogTab />}
          {activeTab === "acquisition" && <AcquisitionTab />}
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
