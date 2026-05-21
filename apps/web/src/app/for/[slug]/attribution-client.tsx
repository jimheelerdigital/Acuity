"use client";

import { useEffect } from "react";

export function AttributionSetter({ slug }: { slug: string }) {
  useEffect(() => {
    try {
      const { setAttributionCookie } = require("@/lib/attribution");
      setAttributionCookie({ landingPath: `/for/${slug}` });
    } catch {}
  }, [slug]);

  return null;
}
