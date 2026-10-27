import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { ResultView, resultMetadata } from "@/components/mythicals/result-view";
import { quizResult } from "@/lib/mythicals/quizzes";
import { basePathFor } from "@/lib/mythicals/site";

/** Weapon quiz result (2026-10-27): /result/weapon/<slug>. */
type Props = { params: { slug: string }; searchParams: { a?: string } };

export function generateMetadata({ params }: Props): Metadata {
  return resultMetadata("weapon", params.slug);
}

export default function WeaponResultPage({ params, searchParams }: Props) {
  if (!quizResult("weapon", params.slug)) notFound();
  return <ResultView kind="weapon" slug={params.slug} base={basePathFor(headers().get("host"))} rawAnswers={searchParams.a} />;
}
