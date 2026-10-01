import type { Metadata } from "next";
import { headers } from "next/headers";

import { Quiz } from "@/components/mythicals/quiz";
import { Track } from "@/components/mythicals/track";
import { basePathFor } from "@/lib/mythicals/site";

export const metadata: Metadata = {
  title: "The Quiz",
  alternates: { canonical: "/quiz" },
};

export default function QuizPage() {
  const base = basePathFor(headers().get("host"));
  return (
    <div className="px-4 pt-6 sm:px-6 sm:pt-12">
      <Track type="page_view" />
      <Quiz base={base} />
    </div>
  );
}
