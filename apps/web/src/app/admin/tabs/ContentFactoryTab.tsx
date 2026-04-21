"use client";

import { useEffect, useState } from "react";
import ContentFactoryClient from "../content-factory/content-factory-client";

interface TabData {
  pendingPieces: unknown[];
  readyPieces: unknown[];
  distributedPieces: unknown[];
  latestBriefing: unknown | null;
  activeJobId: string | null;
}

export default function ContentFactoryTab() {
  const [data, setData] = useState<TabData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/content-factory-data");
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-white/40">Loading content factory…</p>
      </div>
    );
  }

  return (
    <ContentFactoryClient
      pendingPieces={data.pendingPieces as never[]}
      readyPieces={data.readyPieces as never[]}
      distributedPieces={data.distributedPieces as never[]}
      latestBriefing={data.latestBriefing as never}
      activeJobId={data.activeJobId}
    />
  );
}
