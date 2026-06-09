/**
 * Consistency / badges section — floating tiered medallions.
 * Ported from the handoff (`marketing.jsx → Consistency`). Badges render
 * via the ported badge-system renderer (server-side SVG strings).
 */
import { Reveal } from "@/components/landing-shared";

import { BADGES, renderBadge } from "./badge-system";

// Bronze → diamond progression (tiered colorway maps tier 1–5).
const BADGE_SLUGS = ["first_night", "week_one", "month", "hundred", "goal_crusher"];

function Badge({ slug, size }: { slug: string; size: number }) {
  const cfg = BADGES.find((b) => b.slug === slug);
  if (!cfg) return null;
  const svg = renderBadge(cfg, "earned", { colorway: "tiered" }).replace(
    'width="200" height="200"',
    `width="${size}" height="${size}"`
  );
  return (
    <div
      style={{ width: size, height: size }}
      // eslint-disable-next-line react/no-danger -- pure first-party SVG string from badge-system
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function Consistency() {
  return (
    <section className="border-y border-acuity-line bg-acuity-bg-sub px-7 py-[92px]">
      <div className="mx-auto max-w-[1080px] text-center">
        <Reveal>
          <div className="mb-[18px] font-mono text-[12px] font-semibold uppercase tracking-[0.2em] text-acuity-primary">
            Showing up, rewarded
          </div>
          <h2 className="m-0 mb-4 font-display text-[40px] font-extrabold tracking-[-1.2px] text-acuity-text text-balance">
            Consistency you can feel.
          </h2>
          {/* TODO(copy): confirm with Keenan. */}
          <p className="mx-auto mb-12 max-w-[540px] font-sans text-[18px] leading-[1.55] text-acuity-text-sec text-pretty">
            Earn warm, hand-crafted milestones as your streak grows — bronze to diamond. No noisy
            badges, no kitsch. Just a quiet nudge to keep your nightly minute.
          </p>
        </Reveal>
        <Reveal delay={1}>
          <div className="flex flex-wrap justify-center gap-7">
            {BADGE_SLUGS.map((slug, i) => (
              <div
                key={slug}
                className="acuity-float"
                style={{ animationDuration: `${5 + i * 0.4}s`, animationDelay: `${i * 0.3}s` }}
              >
                <Badge slug={slug} size={104} />
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
