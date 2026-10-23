import type { ReactNode } from "react";

import { CreatorFunnelBanner } from "@/components/creators/creator-funnel-banner";

/** Funnel shell: adds the creator "Sent by" banner for creator-link visitors only. */
export default function FunnelLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <CreatorFunnelBanner />
      {children}
    </>
  );
}
