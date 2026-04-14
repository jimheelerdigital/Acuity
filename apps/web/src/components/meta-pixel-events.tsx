"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function TrackCompleteRegistration() {
  useEffect(() => {
    if (typeof fbq !== "undefined") {
      fbq("track", "CompleteRegistration");
    }
  }, []);

  return null;
}

export function TrackPurchase() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("upgraded") === "1" && typeof fbq !== "undefined") {
      fbq("track", "Purchase", { value: 12.99, currency: "USD" });
    }
  }, [searchParams]);

  return null;
}
