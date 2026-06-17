"use client";

import dynamic from "next/dynamic";

// Each section self-lazy-loads its data on scroll (IntersectionObserver), so we
// only need to render them in order. Dynamic imports keep the MRI bundle out of
// the rest of the admin dashboard until this tab is opened.
const AIInsightsPanel = dynamic(() => import("./mri/AIInsightsPanel"));
const SystemHealthSection = dynamic(() => import("./mri/SystemHealthSection"));
const WebFunnelSection = dynamic(() => import("./mri/WebFunnelSection"));
const ActivationFunnelSection = dynamic(
  () => import("./mri/ActivationFunnelSection"),
);
const TrialFunnelSection = dynamic(() => import("./mri/TrialFunnelSection"));
const AcquisitionSection = dynamic(() => import("./mri/AcquisitionSection"));
const FeatureUsageSection = dynamic(() => import("./mri/FeatureUsageSection"));
const EngagementSection = dynamic(() => import("./mri/EngagementSection"));
const FailureSurfacesSection = dynamic(
  () => import("./mri/FailureSurfacesSection"),
);
const RevenueSection = dynamic(() => import("./mri/RevenueSection"));
const UserLookupSection = dynamic(() => import("./mri/UserLookupSection"));

interface Props {
  start: string;
  end: string;
}

function Divider() {
  return (
    <div
      aria-hidden
      style={{ height: 1, background: "rgba(255,255,255,0.06)" }}
    />
  );
}

export default function MRITab({ start, end }: Props) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      {/* AI Insights headline — current-state, loads first. */}
      <AIInsightsPanel />

      <Divider />
      <SystemHealthSection start={start} end={end} />

      <Divider />
      <WebFunnelSection start={start} end={end} />

      <Divider />
      <ActivationFunnelSection start={start} end={end} />

      <Divider />
      <TrialFunnelSection start={start} end={end} />

      <Divider />
      <AcquisitionSection start={start} end={end} />

      <Divider />
      <FeatureUsageSection start={start} end={end} />

      <Divider />
      <EngagementSection start={start} end={end} />

      <Divider />
      <FailureSurfacesSection start={start} end={end} />

      <Divider />
      <RevenueSection start={start} end={end} />

      <Divider />
      <UserLookupSection start={start} end={end} />
    </div>
  );
}
