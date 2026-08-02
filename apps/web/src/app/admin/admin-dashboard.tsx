"use client";

import { useCallback, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
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

type NavItem = { key: TabKey; label: string };
type NavGroup = { eyebrow: string; items: NavItem[] };

const TAB_KEYS = [
  "overview",
  "mri",
  "funnel-analytics",
  "users",
  "ads",
  "content",
  "ai-costs",
  "growth-metrics",
  "business-metrics",
  "feature-adoption",
  "engagement-distribution",
  "settings",
] as const;

type TabKey = (typeof TAB_KEYS)[number];

const NAV_GROUPS: NavGroup[] = [
  {
    eyebrow: "Pulse",
    items: [
      { key: "overview", label: "Overview" },
      { key: "mri", label: "MRI" },
    ],
  },
  {
    eyebrow: "Growth",
    items: [
      { key: "funnel-analytics", label: "Funnel" },
      { key: "ads", label: "Ads" },
      { key: "growth-metrics", label: "Growth metrics" },
    ],
  },
  {
    eyebrow: "Users",
    items: [
      { key: "users", label: "Users" },
      { key: "engagement-distribution", label: "Engagement" },
      { key: "feature-adoption", label: "Feature adoption" },
    ],
  },
  {
    eyebrow: "Money",
    items: [
      { key: "business-metrics", label: "Business" },
      { key: "ai-costs", label: "AI costs" },
    ],
  },
  {
    eyebrow: "Content",
    items: [{ key: "content", label: "Content" }],
  },
  {
    eyebrow: "System",
    items: [{ key: "settings", label: "Settings" }],
  },
];

// Routed admin tools that live outside the tabbed dashboard.
const TOOL_LINKS: { href: string; label: string }[] = [
  { href: "/admin/adlab", label: "AdLab" },
  { href: "/admin/blog-pruner-log", label: "Blog pruner log" },
];

const TAB_LABELS: Record<TabKey, string> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.key, i.label]))
) as Record<TabKey, string>;

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
const NO_TIME_RANGE: Set<string> = new Set(["users", "content", "settings"]);

function NavButton({
  item,
  active,
  onSelect,
}: {
  item: NavItem;
  active: boolean;
  onSelect: (key: TabKey) => void;
}) {
  return (
    <button
      onClick={() => onSelect(item.key)}
      aria-current={active ? "page" : undefined}
      className={`w-full rounded-acuity-sm px-3 py-2 text-left text-[14px] font-medium transition duration-acuity-base ease-acuity-standard ${
        active
          ? "bg-acuity-grad-mix text-white"
          : "text-acuity-text-sec hover:bg-acuity-bg-sub hover:text-acuity-text"
      }`}
    >
      {item.label}
    </button>
  );
}

export default function AdminDashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawTab = searchParams.get("tab") ?? "overview";
  const redirected = LEGACY_REDIRECT[rawTab];
  const tabParam = (redirected ?? rawTab) as TabKey;
  const activeTab = TAB_KEYS.includes(tabParam) ? tabParam : "overview";

  const [timeRange, setTimeRange] = useState<TimeRange>(
    (searchParams.get("range") as TimeRange) ?? "7d"
  );
  const [customStart, setCustomStart] = useState(searchParams.get("cs") ?? "");
  const [customEnd, setCustomEnd] = useState(searchParams.get("ce") ?? "");

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
    <div className="min-h-screen bg-acuity-bg text-acuity-text">
      <div className="mx-auto flex w-full max-w-[1720px]">
        {/* ── Sidebar (desktop) ─────────────────────────────────── */}
        <aside className="sticky top-[68px] hidden h-[calc(100vh-68px)] w-[230px] shrink-0 overflow-y-auto border-r border-acuity-line px-4 py-8 lg:block">
          <nav className="space-y-6">
            {NAV_GROUPS.map((group) => (
              <div key={group.eyebrow}>
                <p className="mb-2 px-3 font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-quiet">
                  {group.eyebrow}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavButton
                      key={item.key}
                      item={item}
                      active={activeTab === item.key}
                      onSelect={setTab}
                    />
                  ))}
                </div>
              </div>
            ))}

            <div>
              <p className="mb-2 px-3 font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-quiet">
                Tools
              </p>
              <div className="space-y-0.5">
                {TOOL_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex w-full items-center justify-between rounded-acuity-sm px-3 py-2 text-[14px] font-medium text-acuity-text-sec transition duration-acuity-base ease-acuity-standard hover:bg-acuity-bg-sub hover:text-acuity-text"
                  >
                    {link.label}
                    <svg
                      className="h-3.5 w-3.5 text-acuity-text-quiet"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8.25 4.5l7.5 7.5-7.5 7.5"
                      />
                    </svg>
                  </Link>
                ))}
              </div>
            </div>
          </nav>
        </aside>

        {/* ── Main content ──────────────────────────────────────── */}
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">
          {/* Mobile nav — horizontal chip scroll */}
          <div className="no-scrollbar mb-6 flex gap-1.5 overflow-x-auto lg:hidden">
            {NAV_GROUPS.flatMap((g) => g.items).map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={`shrink-0 rounded-acuity-pill px-4 py-2 text-[13px] font-medium transition ${
                  activeTab === item.key
                    ? "bg-acuity-grad-mix text-white"
                    : "bg-acuity-bg-sub text-acuity-text-sec hover:text-acuity-text"
                }`}
              >
                {item.label}
              </button>
            ))}
            {TOOL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="shrink-0 rounded-acuity-pill bg-acuity-bg-sub px-4 py-2 text-[13px] font-medium text-acuity-text-sec hover:text-acuity-text"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Page header */}
          <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <h1
              className="font-display font-bold text-acuity-text"
              style={{ fontSize: 30, letterSpacing: "-0.8px", lineHeight: 1 }}
            >
              {TAB_LABELS[activeTab]}
            </h1>
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

          {/* Tab content */}
          <div className="acuity-fade-in" key={activeTab}>
            {activeTab === "overview" && (
              <OverviewTab start={startStr} end={endStr} />
            )}
            {activeTab === "mri" && <MRITab start={startStr} end={endStr} />}
            {activeTab === "users" && <UsersTab />}
            {activeTab === "ads" && <AdsTab start={startStr} end={endStr} />}
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
        </main>
      </div>
    </div>
  );
}
