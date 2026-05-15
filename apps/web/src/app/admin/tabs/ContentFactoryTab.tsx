"use client";

import { useEffect, useState } from "react";
import ContentFactoryClient from "../content-factory/content-factory-client";

interface ContentPiece {
  id: string;
  type: string;
  title: string;
  body: string;
  hook: string;
  cta: string;
  predictedScore: number;
  status: string;
  heroImageUrl: string | null;
  createdAt: string;
}

interface TabData {
  pieces: ContentPiece[];
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
      pieces={data.pieces}
      activeJobId={data.activeJobId}
    />
  );
}
