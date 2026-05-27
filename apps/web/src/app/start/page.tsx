import type { Metadata } from "next";
import { StartPageClient } from "./client";

export const metadata: Metadata = {
  title: "Start Free Trial — Acuity",
  description:
    "Start your Acuity journey. See what one 60-second debrief can tell you about your life.",
  robots: { index: false, follow: false },
};

/**
 * Server component — renders Screen 1 (Pain Hook) as real HTML in the initial
 * response so content is visible before any JS downloads. The client component
 * hydrates on top and takes over for step navigation.
 *
 * This is critical for FB in-app browser traffic where JS takes 3-5s to load.
 */
export default async function StartPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const step = typeof searchParams.step === "string" ? searchParams.step : null;

  // If returning from OAuth or Stripe, skip SSR pain hook — let client handle
  if (step === "paywall" || step === "download") {
    return <StartPageClient hook={null} skipSSR />;
  }

  // Fetch dynamic hook server-side from UTM params
  let hook: { headline: string; subheadline: string } | null = null;
  const utmContent = typeof searchParams.utm_content === "string" ? searchParams.utm_content : null;
  const utmCampaign = typeof searchParams.utm_campaign === "string" ? searchParams.utm_campaign : null;

  if (utmContent || utmCampaign) {
    try {
      const { prisma } = await import("@/lib/prisma");

      if (utmContent) {
        const creative = await prisma.adLabCreative.findUnique({
          where: { id: utmContent },
          select: {
            headline: true,
            primaryText: true,
            angle: {
              select: {
                experiment: {
                  select: { customPainHook: true },
                },
              },
            },
          },
        });
        if (creative) {
          const custom = tryParse(creative.angle.experiment.customPainHook as string | null);
          hook = {
            headline: custom?.headline || creative.headline,
            subheadline: custom?.subheadline || creative.primaryText.slice(0, 150),
          };
        }
      }

      if (!hook && utmCampaign) {
        const experiment = await prisma.adLabExperiment.findFirst({
          where: {
            OR: [
              { campaignName: { contains: utmCampaign, mode: "insensitive" } },
              { topicBrief: { contains: utmCampaign, mode: "insensitive" } },
            ],
          },
          select: { customPainHook: true },
          orderBy: { createdAt: "desc" },
        });
        if (experiment?.customPainHook) {
          const custom = tryParse(experiment.customPainHook);
          if (custom?.headline) hook = custom as { headline: string; subheadline: string };
        }
      }
    } catch (err) {
      console.error("[start] Hook lookup failed:", err);
    }
  }

  const headline = hook?.headline || "Same week. Same loop. Same you.";
  const subtext = hook?.subheadline || "Days blur. Nothing sticks. Life passes.";

  return (
    <>
      {/* Critical inline CSS — styles Screen 1 before the CSS bundle loads */}
      <style dangerouslySetInnerHTML={{ __html: `
        .ssr-pain-hook{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1.5rem;background:#fff;color:#18181b;position:relative;overflow:hidden}
        .ssr-pain-hook__bg{position:absolute;inset:0;opacity:.3;background:linear-gradient(135deg,#f8f6ff 0%,#fff 40%,#f5f0ff 70%,#fff 100%)}
        .ssr-pain-hook__inner{position:relative;max-width:28rem;text-align:center}
        .ssr-pain-hook h1{font-size:1.875rem;font-weight:800;letter-spacing:-.025em;line-height:1.2}
        @media(min-width:640px){.ssr-pain-hook h1{font-size:2.25rem}}
        .ssr-pain-hook__sub{margin-top:1.5rem;color:#71717a;font-size:1rem}
        .ssr-pain-hook__btn{margin-top:2rem;display:inline-block;border-radius:9999px;background:#7C5CFC;padding:.875rem 2rem;font-size:.875rem;font-weight:600;color:#fff;border:none;cursor:pointer;box-shadow:0 4px 16px rgba(124,92,252,.3)}
        .ssr-pain-hook__testimonial{margin-top:2.5rem;font-size:.75rem;font-style:italic;color:#a1a1aa}
      `}} />

      {/* Server-rendered Screen 1 — visible instantly, before JS loads */}
      <div id="ssr-pain-hook" className="ssr-pain-hook">
        <div className="ssr-pain-hook__bg" />
        <div className="ssr-pain-hook__inner">
          <h1>{headline}</h1>
          <p className="ssr-pain-hook__sub">{subtext}</p>
          <p className="ssr-pain-hook__testimonial">
            &ldquo;I didn&apos;t realize I was living the same week on repeat until Acuity showed me.&rdquo; — Priya R.
          </p>
          <button className="ssr-pain-hook__btn" id="ssr-continue-btn">
            Continue
          </button>
        </div>
      </div>

      {/* Client component hydrates on top — hides SSR content and takes over */}
      <StartPageClient hook={hook} />
    </>
  );
}

function tryParse(json: string | null | undefined): Record<string, string> | null {
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}
