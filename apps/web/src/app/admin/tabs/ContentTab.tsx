"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const AutoBlogTab = dynamic(() => import("./AutoBlogTab"));
const ContentFactoryTab = dynamic(() => import("./ContentFactoryTab"));

type Section = "social" | "blog";

export default function ContentTab() {
  const [section, setSection] = useState<Section>("social");

  return (
    <div className="space-y-6">
      {/* Sub-section toggle */}
      <div className="flex gap-1 rounded-lg bg-[#13131F] p-1 w-fit">
        {(["social", "blog"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              section === s
                ? "bg-[#8E6FE6] text-white"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            {s === "social" ? "Social" : "Blog"}
          </button>
        ))}
      </div>

      {section === "social" && <ContentFactoryTab />}
      {section === "blog" && <AutoBlogTab />}
    </div>
  );
}
