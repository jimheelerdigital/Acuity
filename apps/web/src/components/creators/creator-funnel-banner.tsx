"use client";

/**
 * "Sent by Tess · your code TESS50 is saved" — shown at the top of the
 * sign-up funnel for visitors who arrived through a creator link
 * (goripple.io/c/<CODE> sets the readable rp_creator cookie, "CODE|Name").
 * Renders nothing for everyone else, so ad traffic sees no change.
 */
import { useEffect, useState } from "react";

import { CODE_COOKIE } from "@/lib/creators/config";

export function CreatorFunnelBanner() {
  const [info, setInfo] = useState<{ code: string; name: string } | null>(null);
  useEffect(() => {
    try {
      const raw = document.cookie
        .split(/;\s*/)
        .find((c) => c.startsWith(`${CODE_COOKIE}=`))
        ?.slice(CODE_COOKIE.length + 1);
      if (!raw) return;
      const [code, name] = decodeURIComponent(raw).split("|");
      if (code && /^[A-Z0-9]{4,12}$/.test(code)) setInfo({ code, name: name || "a creator" });
    } catch {
      /* no banner */
    }
  }, []);
  if (!info) return null;
  return (
    <div className="bg-[#1B1815] px-4 py-2 text-center text-[13px] font-semibold text-[#FBF6EF]">
      Sent by {info.name} <span aria-hidden="true">·</span> your code{" "}
      <span className="rounded-full bg-[#FBF6EF]/10 px-2 py-0.5 font-mono tracking-[1.4px]">{info.code}</span> is saved
    </div>
  );
}
