"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function TrackCompleteRegistration() {
  useEffect(() => {
    if (typeof fbq !== "undefined") {
      console.log('[meta-pixel] Firing CompleteRegistration');
      fbq("track", "CompleteRegistration", { content_name: 'Free Trial Signup', currency: 'USD', value: 0 });
      console.log('[meta-pixel] Firing StartTrial');
      fbq("track", "StartTrial", { currency: 'USD', value: 0, predicted_ltv: 12.99 });
    }
  }, []);

  return null;
}

export function TrackSubscribe() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("upgraded") === "1" && typeof fbq !== "undefined") {
      const plan = searchParams.get("plan");
      const value = plan === "yearly" ? 99 : 12.99;
      console.log(`[meta-pixel] Firing Subscribe — ${plan} plan, $${value}`);
      fbq("track", "Subscribe", { currency: "USD", value });
    }
  }, [searchParams]);

  return null;
}

export function TrackViewContent({ contentName }: { contentName: string }) {
  useEffect(() => {
    if (typeof fbq !== "undefined") {
      console.log(`[meta-pixel] Firing ViewContent — ${contentName}`);
      fbq("track", "ViewContent", { content_name: contentName });
    }
  }, [contentName]);

  return null;
}
