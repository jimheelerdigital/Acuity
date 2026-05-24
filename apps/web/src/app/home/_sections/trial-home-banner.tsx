import { GradientText, HeroCard, SectionHeader } from "@/components/acuity";

/**
 * TrialHomeBanner — atmospheric pinned banner above the home grid for
 * users in the trial endgame. Slice 7 (2026-05-25).
 *
 * Gate (both must be live for the banner to render):
 *   - subscriptionStatus === "TRIAL" AND daysRemaining <= 7, OR
 *   - subscriptionStatus === "FREE" AND trialExpiredAt within the
 *     past POST_EXPIRY_BANNER_DAYS (14).
 *
 * Composition: HeroCard (primary/mix variant), mono eyebrow, large
 * countdown or "Your insights are paused" headline, stats row
 * (entries · streak · themes), Continue-on-web CTA. Mirrors the
 * /account TrialStatusCard but tuned for a wider hero placement.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const POST_EXPIRY_BANNER_DAYS = 14;
const UPGRADE_HREF = "/upgrade?src=home_trial_banner";

export async function TrialHomeBanner({ userId }: { userId: string }) {
  const { prisma } = await import("@/lib/prisma");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionStatus: true,
      trialEndsAt: true,
      trialExpiredAt: true,
      totalRecordings: true,
      currentStreak: true,
    },
  });
  if (!user) return null;

  const now = Date.now();

  let mode: "trial-warning" | "trial-urgent" | "post-expiry" | null = null;
  let daysRemaining = 0;

  if (user.subscriptionStatus === "TRIAL" && user.trialEndsAt) {
    const msLeft = user.trialEndsAt.getTime() - now;
    daysRemaining = Math.max(0, Math.ceil(msLeft / MS_PER_DAY));
    if (daysRemaining <= 0) {
      mode = "post-expiry";
    } else if (daysRemaining <= 3) {
      mode = "trial-urgent";
    } else if (daysRemaining <= 7) {
      mode = "trial-warning";
    }
  } else if (
    user.subscriptionStatus === "FREE" &&
    user.trialExpiredAt
  ) {
    const daysSince =
      (now - user.trialExpiredAt.getTime()) / MS_PER_DAY;
    if (daysSince >= 0 && daysSince <= POST_EXPIRY_BANNER_DAYS) {
      mode = "post-expiry";
    }
  }

  if (!mode) return null;

  const themesSurfaced = await prisma.theme.count({
    where: { userId, mentions: { some: {} } },
  });

  const stats: { label: string; value: string }[] = [
    {
      label: user.totalRecordings === 1 ? "entry" : "entries",
      value: String(user.totalRecordings),
    },
  ];
  if ((user.currentStreak ?? 0) >= 2) {
    stats.push({
      label: "day streak",
      value: String(user.currentStreak ?? 0),
    });
  }
  stats.push({
    label: themesSurfaced === 1 ? "theme surfaced" : "themes surfaced",
    value: String(themesSurfaced),
  });

  if (mode === "post-expiry") {
    return (
      <section className="mb-6">
        <HeroCard variant="primary" padding={6}>
          <SectionHeader label="Trial ended" />
          <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-acuity-text sm:text-3xl">
            Your insights are paused
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-acuity-text-sec">
            Recording stays yours. Your data is preserved. Life Matrix,
            Theme Map, and weekly insights are saved exactly where you
            left them — continue on web to bring them back.
          </p>
          <StatsRow stats={stats} />
          <CtaRow />
        </HeroCard>
      </section>
    );
  }

  if (mode === "trial-urgent") {
    return (
      <section className="mb-6">
        <HeroCard variant="primary" padding={6}>
          <SectionHeader label="Trial" />
          <p className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            <span style={{ color: "var(--acuity-warn)" }}>
              {daysRemaining} {daysRemaining === 1 ? "day" : "days"}
            </span>
            <span className="text-acuity-text"> left</span>
          </p>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-acuity-text-sec">
            After your trial ends, recording stays free. Life Matrix and
            Theme Map lock until you continue on web.
          </p>
          <StatsRow stats={stats} />
          <CtaRow />
        </HeroCard>
      </section>
    );
  }

  // trial-warning (4-7 days) — gradient-tinted count, no urgent color.
  return (
    <section className="mb-6">
      <HeroCard variant="primary" padding={6}>
        <SectionHeader label="Trial" />
        <p className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          <GradientText variant="mix">
            {daysRemaining} {daysRemaining === 1 ? "day" : "days"}
          </GradientText>
          <span className="text-acuity-text"> left</span>
        </p>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-acuity-text-sec">
          After your trial, recording stays yours. Life Matrix, Theme
          Map, and weekly insights move to Pro.
        </p>
        <StatsRow stats={stats} />
        <CtaRow />
      </HeroCard>
    </section>
  );
}

function StatsRow({
  stats,
}: {
  stats: { label: string; value: string }[];
}) {
  return (
    <div className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
      {stats.map((s, i) => (
        <div key={i} className="flex items-baseline gap-1.5">
          <span className="font-display text-lg font-bold tracking-tight text-acuity-text tabular-nums">
            {s.value}
          </span>
          <span className="text-[13px] text-acuity-text-ter">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function CtaRow() {
  return (
    <div className="mt-5">
      <a
        href={UPGRADE_HREF}
        className="inline-flex items-center gap-2 rounded-acuity-pill bg-acuity-grad-primary px-5 py-2.5 text-[14px] font-semibold text-white shadow-acuity-glow-primary transition hover:brightness-110 active:scale-[0.98]"
      >
        Continue on web
        <span aria-hidden="true">→</span>
      </a>
    </div>
  );
}
