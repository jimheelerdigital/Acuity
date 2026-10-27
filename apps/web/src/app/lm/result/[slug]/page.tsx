import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { ResultView, resultMetadata } from "@/components/mythicals/result-view";
import { quizResult } from "@/lib/mythicals/quizzes";
import { basePathFor } from "@/lib/mythicals/site";

/** Beast result (launch URL kept: /result/<slug>). */
type Props = { params: { slug: string }; searchParams: { a?: string } };

export function generateMetadata({ params }: Props): Metadata {
  return resultMetadata("beast", params.slug);
}

export default function BeastResultPage({ params, searchParams }: Props) {
  if (!quizResult("beast", params.slug)) notFound();
  return <ResultView kind="beast" slug={params.slug} base={basePathFor(headers().get("host"))} rawAnswers={searchParams.a} />;
}
