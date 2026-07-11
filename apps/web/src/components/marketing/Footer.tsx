/**
 * Footer — brand blurb + link columns + legal row. Ported from the
 * handoff (`marketing.jsx → Footer`). On-page anchors for product links;
 * real routes for Privacy/Terms.
 */
const COLS: { head: string; links: [string, string][] }[] = [
  {
    head: "Product",
    links: [
      ["Features", "#features"],
      ["How it works", "#how"],
      ["Pricing", "#pricing"],
      ["Download", "/start"],
    ],
  },
  {
    head: "Company",
    links: [
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
      ["Support", "/support"],
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-acuity-line bg-acuity-bg-inset px-7 pb-10 pt-14">
      <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-8 min-[700px]:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="mb-3.5 flex items-center gap-2.5">
            <span className="h-6 w-6 rounded-[8px] bg-acuity-grad-primary" />
            <span className="font-display text-[19px] font-extrabold text-acuity-text">Ripple</span>
          </div>
          <p className="m-0 max-w-[260px] font-sans text-[14.5px] leading-[1.55] text-acuity-text-ter">
            The AI voice journal for your daily debrief. One minute a day, a life of clarity.
          </p>
        </div>
        {COLS.map((col) => (
          <div key={col.head}>
            <div className="mb-4 font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-acuity-text-ter">
              {col.head}
            </div>
            <div className="flex flex-col gap-[11px]">
              {col.links.map(([label, href]) => (
                <a key={label} href={href} className="font-sans text-[14.5px] text-acuity-text-sec transition-colors hover:text-acuity-text">
                  {label}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-10 flex max-w-[1180px] flex-wrap justify-between gap-3 border-t border-acuity-line pt-6">
        <span className="font-sans text-[13.5px] text-acuity-text-ter">© 2026 Ripple. All rights reserved.</span>
        <span className="font-sans text-[13.5px] text-acuity-text-ter">Made for quiet, consistent reflection.</span>
      </div>
    </footer>
  );
}
