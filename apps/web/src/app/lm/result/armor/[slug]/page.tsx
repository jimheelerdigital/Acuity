import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { ResultView, resultMetadata } from "@/components/mythicals/result-view";
import { quizResult } from "@/lib/mythicals/quizzes";
import { basePathFor } from "@/lib/mythicals/site";

/** Armor quiz result (2026-10-27): /result/armor/<slug>. */
type Props = { params: { slug: string }; searchParams: { a?: string } };

export function generateMetadata({ params }: Props): Metadata {
  return resultMetadata("armor", params.slug);
}

export default function ArmorResultPage({ params, searchParams }: Props) {
  if (!quizResult("armor", params.slug)) notFound();
  return <ResultView kind="armor" slug={params.slug} base={basePathFor(headers().get("host"))} rawAnswers={searchParams.a} />;
}
