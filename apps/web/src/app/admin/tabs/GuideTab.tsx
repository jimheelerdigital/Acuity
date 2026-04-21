"use client";

interface GuideMetric {
  name: string;
  measures: string;
  matters: string;
  healthy: string;
  redFlag: string;
  action?: string;
}

interface GuideSection {
  tab: string;
  metrics: GuideMetric[];
}

const GUIDE_DATA: GuideSection[] = [
  {
    tab: "Overview",
    metrics: [
      {
        name: "New Signups This Week",
        measures:
          "How many people signed up for Acuity in the last 7 days, across all sources (waitlist, direct signup, referral).",
        matters:
          "Top-of-funnel health. If this is zero, nothing downstream can grow.",
        healthy: "Growing week-over-week, even slowly.",
        redFlag: "Zero organic signups for 14 consecutive days.",
        action:
          "Kill the worst-performing marketing channel and try a new one.",
      },
      {
        name: "Trial-to-Paid Conversion Rate",
        measures:
          "Of the users who finished their 14-day free trial, what percent became paying subscribers.",
        matters:
          "The single most important number in the business. If people don't convert, no amount of traffic saves you.",
        healthy: "20% or higher.",
        redFlag: "Below 15% across the first 100 completed trials.",
        action:
          "Stop all marketing. Fix the weekly report (the core moment of value) before scaling anything.",
      },
      {
        name: "Active Paying Subscribers",
        measures:
          "Users currently on a paid plan with an active Stripe subscription.",
        matters:
          "Your actual customer count. Everything else is funnel noise.",
        healthy: "Growing month-over-month.",
        redFlag: "Flat or declining for 2+ consecutive months.",
        action:
          "Look at churn \u2014 are you losing users faster than you gain them?",
      },
      {
        name: "Monthly Recurring Revenue (MRR)",
        measures:
          "The predictable recurring revenue if every current subscriber paid for one month. Paying subs \u00d7 $12.99 = MRR.",
        matters:
          "The north-star revenue metric for any subscription business.",
        healthy: "Growing. Target milestones: $1K \u2192 $10K \u2192 $100K.",
        redFlag: "MRR dropping month-over-month.",
        action:
          "Check churn rate and payment failures. Fix whichever is bleeding more.",
      },
      {
        name: "Blended Customer Acquisition Cost (CAC)",
        measures:
          "Total ad spend \u00f7 total new signups. Tells you what each signup cost on average.",
        matters:
          "If CAC is higher than Lifetime Value (LTV), you lose money on every customer.",
        healthy: "Under $20 for a $12.99/month product.",
        redFlag: "Over $30 or climbing week-over-week.",
        action:
          "Pause paid ads, go zero-CAC (Reddit, Twitter, referrals) for 30 days.",
      },
      {
        name: "Claude Spend (Month-to-Date)",
        measures:
          "Total Anthropic API costs this month for all AI features (extraction, weekly reports, content factory, etc.).",
        matters:
          "Your biggest variable cost. At $12.99/month revenue per user, AI cost per user must stay well under $4 to hit target margins.",
        healthy: "Under the $100/month budget at current user volume.",
        redFlag: "Over $100 or costs growing faster than user count.",
        action:
          "Check the AI Costs tab for which feature is spending most. Optimize that prompt first.",
      },
    ],
  },
  {
    tab: "Growth",
    metrics: [
      {
        name: "Waitlist Signups",
        measures:
          "People who submitted their email but haven't created an account yet.",
        matters:
          "A leading indicator. Waitlist interest predicts whether you'll hit signup targets.",
        healthy: "Any growth is good at this stage.",
        redFlag:
          "More than 10 waitlist signups who haven't converted to accounts in 30+ days.",
        action:
          "Email them directly with TestFlight/PWA access and a personal note.",
      },
      {
        name: "Day 0 Activation Rate",
        measures:
          "Of all users who signed up, what percent completed their first recording on signup day.",
        matters:
          "If users can't get through onboarding and record once, nothing else matters.",
        healthy: "60% or higher.",
        redFlag: "Below 60%.",
        action:
          "Fix onboarding. Test yourself. Watch 3 friends try it and take notes.",
      },
      {
        name: "Day 7 Retention Rate",
        measures:
          "Of users who signed up 7+ days ago, what percent are still recording at Day 7.",
        matters:
          "This is where the habit forms or breaks. Users who reach Day 7 and read their first weekly report are 10x more likely to convert to paid.",
        healthy: "35% or higher.",
        redFlag: "Below 35%.",
        action:
          "Fix push notifications (the 9 PM nightly reminder is the single largest retention lever) and the quality of the weekly report.",
      },
      {
        name: "Signups by Source",
        measures:
          "Breakdown of where signups come from (Reddit, Twitter, TikTok, Meta Ads, organic, referral, direct).",
        matters:
          "Shows you which marketing channels are actually working \u2014 not by traffic, by signups.",
        healthy: "Diversified across 3+ sources.",
        redFlag: "80%+ from one source.",
        action:
          "Diversify. One channel going cold kills the business if you're dependent on it.",
      },
    ],
  },
  {
    tab: "Engagement",
    metrics: [
      {
        name: "Daily Active Users (DAU)",
        measures: "Unique users who recorded a brain dump today.",
        matters: "The strongest signal that the habit is forming.",
        healthy: "Growing with signup growth.",
        redFlag:
          "DAU shrinking while signups grow \u2014 churn is winning.",
        action:
          "Survey recent churned users. What stopped working for them?",
      },
      {
        name: "Weekly Active Users (WAU)",
        measures:
          "Unique users who recorded at least once in the last 7 days.",
        matters:
          'The habit is weekly, but "weekly report" depends on 5+ recordings per week.',
        healthy:
          "WAU = 50\u201380% of signups in the last 30 days.",
        redFlag: "WAU dropping while MAU stays flat.",
        action:
          "Users are drifting from weekly to monthly. Push notifications need tuning.",
      },
      {
        name: "Monthly Active Users (MAU)",
        measures:
          "Unique users who recorded at least once in the last 30 days.",
        matters:
          'Your total "engaged user base" in any given month.',
        healthy:
          "Should equal or exceed your paying subscriber count.",
        redFlag:
          "MAU below paying subs means people are paying but not using. Churn is coming.",
        action:
          'Email inactive paying subs: "Still using Acuity? Anything we can help with?"',
      },
      {
        name: "Daily/Monthly Active Users Ratio (DAU/MAU)",
        measures:
          "Of your monthly active users, what percent use the app daily.",
        matters:
          "The gold-standard engagement metric. For habit products, you want it high.",
        healthy:
          "50% or higher (means half of monthly users show up daily).",
        redFlag: "Below 20%.",
        action:
          "The nightly recording habit isn't forming. Review onboarding and push notifications.",
      },
      {
        name: "Average Recordings Per User Per Week",
        measures:
          "Average number of brain dumps each active user does in a week.",
        matters:
          "The weekly report needs 5+ recordings to be good. Users below 5 get worse reports.",
        healthy: "5 or higher.",
        redFlag: "Average below 4.",
        action:
          "Check if free-tier recording caps are too low, or if push notifications aren't firing.",
      },
      {
        name: "Silent Trial Users",
        measures:
          "Users currently in their trial who haven't recorded in 3+ days.",
        matters:
          "These users are about to churn. Every day without recording makes it worse.",
        healthy: "Empty or very short list.",
        redFlag: "Same users silent for 5+ days.",
        action:
          'Personal email from Keenan: "Hey, noticed you haven\'t recorded in a few days \u2014 anything blocking you?"',
      },
    ],
  },
  {
    tab: "Revenue",
    metrics: [
      {
        name: "Monthly Recurring Revenue (MRR)",
        measures:
          "Same as Overview. Paying subs \u00d7 $12.99.",
        matters: "Your north-star revenue number.",
        healthy: "Growing.",
        redFlag: "Declining.",
        action: "Focus on churn and acquisition.",
      },
      {
        name: "Churn Rate",
        measures:
          "Percent of paying subscribers who cancel in a given month.",
        matters:
          "High churn means users aren't getting enough value. It's a product problem, not a marketing problem.",
        healthy: "Under 5% monthly for a $12.99 product.",
        redFlag: "Over 10% monthly.",
        action:
          'Email every churned user: "What would have made you stay?" Read every reply.',
      },
      {
        name: "Trial-to-Paid Conversion Rate",
        measures:
          "Same as Overview. Of completed trials, what percent converted.",
        matters:
          "The one number that validates or invalidates the business.",
        healthy: "20% or higher.",
        redFlag: "Below 15%.",
        action: "Stop marketing. Fix the weekly report.",
      },
      {
        name: "Average Revenue Per User (ARPU)",
        measures: "Total revenue \u00f7 total paying users.",
        matters:
          "Tells you the average customer is paying what you'd expect.",
        healthy:
          "Should equal your monthly price ($12.99) unless you add annual plans.",
        redFlag:
          "Significantly below $12.99 \u2014 discounts or comps are too generous.",
      },
      {
        name: "Failed Payment Alerts",
        measures:
          "Users whose Stripe subscription is in PAST_DUE status.",
        matters:
          "Expired cards are the #1 silent churn source. Most users don't even know their card failed.",
        healthy: "Handled within 3 days.",
        redFlag: "Users stuck PAST_DUE for more than 3 days.",
        action:
          "Email them with a direct link to update their card (Stripe Customer Portal).",
      },
    ],
  },
  {
    tab: "Funnel",
    metrics: [
      {
        name: "The Full Funnel",
        measures:
          "How users flow from landing page visitor \u2192 waitlist \u2192 signup \u2192 first recording \u2192 Day 7 \u2192 paid.",
        matters: "Shows you exactly where people drop off.",
        healthy: "Drop-off of less than 50% at any single step.",
        redFlag: "One step loses 70%+ of users.",
        action:
          "Fix that specific step before anything else. It's the biggest leak.",
      },
      {
        name: "Drop-Off by Source",
        measures:
          "Same funnel, broken down by traffic source (Reddit vs Meta Ads vs organic).",
        matters:
          "Some sources convert 10\u00d7 better than others all the way through.",
        healthy:
          "Lowest-converting source should still reach paid at 10%+ of its signups.",
        redFlag:
          "A source brings lots of signups but zero paid conversions.",
        action:
          "Either stop acquiring from that source, or dig into WHY those users don't convert.",
      },
    ],
  },
  {
    tab: "Ads",
    metrics: [
      {
        name: "Total Ad Spend This Period",
        measures:
          "Sum of all Meta ad spend in the selected date range.",
        matters: "Your burn rate for paid acquisition.",
        healthy:
          "Proportional to Customer Acquisition Cost (CAC) \u00d7 new paying subs gained.",
        redFlag: "Spend growing without signups growing.",
      },
      {
        name: "Blended Customer Acquisition Cost (CAC)",
        measures:
          "Total ad spend \u00f7 total new signups across all paid channels.",
        matters: "Tells you the economics of paid acquisition.",
        healthy: "Under $20.",
        redFlag: "Over $30.",
        action: "Pause ads, rely on organic for 30 days.",
      },
      {
        name: "Customer Acquisition Cost (CAC) by Campaign",
        measures:
          "Same as above but split by campaign (therapy, sleep, founders, etc.).",
        matters:
          "Helps you kill bad campaigns and scale good ones.",
        healthy: "Your best campaign should be under $15.",
        redFlag: "Any campaign over $40.",
        action:
          "Pause that campaign. Try different creative or different audience.",
      },
    ],
  },
  {
    tab: "AI Costs",
    metrics: [
      {
        name: "Claude Spend (Month-to-Date)",
        measures:
          "Total spend on Anthropic Claude API calls this month.",
        matters:
          "Your biggest variable cost. Directly eats margin.",
        healthy: "Under $100/month at current user volume.",
        redFlag: "Over $100 or growing faster than user count.",
        action:
          "Look at which feature spends most. Tune that prompt for fewer tokens.",
      },
      {
        name: "Spend by Feature",
        measures:
          "Breakdown of Claude spend across extraction, weekly reports, Life Audit, memoir, content factory, etc.",
        matters: "Tells you which AI feature costs most per use.",
        healthy: "No single feature over 50% of total spend.",
        redFlag: "One feature blowing past the others.",
        action: "Optimize that prompt first.",
      },
      {
        name: "AI Cost as Percent of Monthly Recurring Revenue",
        measures:
          "Total AI spend \u00f7 Monthly Recurring Revenue (MRR).",
        matters:
          "Margin pressure indicator. Below 30% = good. Above 50% = bad.",
        healthy: "10\u201325%.",
        redFlag: "Above 40%.",
        action:
          "Either raise prices, cut AI features, or optimize prompts.",
      },
    ],
  },
  {
    tab: "Red Flags",
    metrics: [
      {
        name: "Critical Red Flags",
        measures:
          "Automated detection of urgent issues (failed webhooks, Inngest job failures, payment failures, database errors).",
        matters:
          "These break the product or cost money. They need immediate attention.",
        healthy: "Empty list.",
        redFlag: "Anything in Critical.",
        action:
          "Click the flag, fix the underlying issue, mark it resolved.",
      },
      {
        name: "Warning Red Flags",
        measures:
          "Automated detection of worrying trends (silent trial users, email bounces, expired cards, activation drops).",
        matters:
          "These don't break the product but they kill growth silently.",
        healthy: "Low and decreasing over time.",
        redFlag: "Same warnings persisting week after week.",
        action:
          "Review each Sunday during the dashboard review ritual.",
      },
    ],
  },
  {
    tab: "Users",
    metrics: [
      {
        name: "All Users Table",
        measures:
          "Every signed-up user with their status (trial, paying, churned), last activity date, recordings count.",
        matters:
          "When you need to look up a specific user (support issue, refund request), this is where.",
        healthy: "N/A \u2014 reference table.",
        redFlag: "",
        action:
          "Use for admin actions (extend trial, send magic link).",
      },
    ],
  },
  {
    tab: "Feature Flags",
    metrics: [
      {
        name: "Feature Flag Status",
        measures:
          "Which features are turned on vs off for which users.",
        matters:
          "Lets you test new features on a subset of users before rolling out to everyone.",
        healthy:
          "Most flags on for everyone, new flags tested on a small group first.",
        redFlag: "",
        action:
          "Turn new features on gradually. Never launch to everyone day one.",
      },
    ],
  },
];

const TAB_IDS = GUIDE_DATA.map((s) =>
  s.tab.toLowerCase().replace(/\s+/g, "-")
);

export default function GuideTab() {
  return (
    <div className="flex gap-6">
      {/* Sidebar nav */}
      <nav className="hidden lg:block sticky top-6 self-start w-48 shrink-0">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/30">
          Jump to Tab
        </h4>
        <ul className="space-y-1">
          {GUIDE_DATA.map((section, i) => (
            <li key={section.tab}>
              <a
                href={`#guide-${TAB_IDS[i]}`}
                className="block rounded-md px-3 py-1.5 text-sm text-white/50 transition hover:bg-white/5 hover:text-white/80"
              >
                {section.tab}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-8">
        {/* Intro */}
        <div className="rounded-xl bg-[#13131F] p-6">
          <h2 className="text-lg font-bold text-white mb-2">
            Metrics Guide
          </h2>
          <p className="text-sm text-white/60 leading-relaxed">
            This guide explains every metric in the Acuity admin dashboard. Use
            it when you&apos;re not sure what a number means, whether it&apos;s
            healthy, or what to do if something looks wrong.
          </p>
        </div>

        {/* Sections */}
        {GUIDE_DATA.map((section, i) => (
          <div key={section.tab} id={`guide-${TAB_IDS[i]}`}>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-[#7C5CFC]">
              {section.tab} Tab
            </h3>
            <div className="space-y-3">
              {section.metrics.map((metric) => (
                <div
                  key={metric.name}
                  className="rounded-xl bg-[#13131F] p-5"
                >
                  <h4 className="text-sm font-bold text-white mb-3">
                    {metric.name}
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-white/40 font-medium">
                        What it measures:{" "}
                      </span>
                      <span className="text-white/70">{metric.measures}</span>
                    </div>
                    <div>
                      <span className="text-white/40 font-medium">
                        Why it matters:{" "}
                      </span>
                      <span className="text-white/70">{metric.matters}</span>
                    </div>
                    <div className="flex gap-4 flex-wrap">
                      <div className="flex-1 min-w-[200px] rounded-lg bg-green-900/10 border border-green-500/10 px-3 py-2">
                        <span className="text-[10px] uppercase tracking-wider text-green-400/60 font-medium">
                          Healthy
                        </span>
                        <p className="text-sm text-green-300/80 mt-0.5">
                          {metric.healthy}
                        </p>
                      </div>
                      {metric.redFlag && (
                        <div className="flex-1 min-w-[200px] rounded-lg bg-red-900/10 border border-red-500/10 px-3 py-2">
                          <span className="text-[10px] uppercase tracking-wider text-red-400/60 font-medium">
                            Red Flag
                          </span>
                          <p className="text-sm text-red-300/80 mt-0.5">
                            {metric.redFlag}
                          </p>
                        </div>
                      )}
                    </div>
                    {metric.action && (
                      <div className="rounded-lg bg-amber-900/10 border border-amber-500/10 px-3 py-2">
                        <span className="text-[10px] uppercase tracking-wider text-amber-400/60 font-medium">
                          What to do
                        </span>
                        <p className="text-sm text-amber-300/80 mt-0.5">
                          {metric.action}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
