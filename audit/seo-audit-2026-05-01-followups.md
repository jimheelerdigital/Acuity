# SEO Audit Followups — 2026-05-01

## Manual steps for Keenan (cannot be automated)

1. **Fix Vercel domain redirect (P0).** In Vercel dashboard > Project > Settings > Domains: set `getacuity.io` as the primary domain and configure `www.getacuity.io` to 301 redirect to `getacuity.io`. Currently non-www 307-redirects to www, which contradicts all canonical URLs and sitemap entries.
2. **Verify Google Search Console (P1).** Confirm `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` env var is set in Vercel. Verify domain ownership in Search Console. Submit `https://getacuity.io/sitemap.xml`. Request indexing of key /for/ pages.
3. **Set up Bing Webmaster Tools (P1).** Go to bing.com/webmasters, add getacuity.io, verify via DNS TXT record. Submit sitemap. Bing powers ChatGPT search results.
4. **Provide social profile URLs (P1).** Twitter/X, LinkedIn, and Instagram URLs are needed for the Organization schema `sameAs` array (currently empty with a TODO comment in layout.tsx).
5. **Confirm aggregateRating source (P1).** The SoftwareApplication schema previously claimed 4.9/5 from 127 reviews. This has been REMOVED in this commit. To re-add, provide a verifiable public review source (App Store listing, G2 page, or Trustpilot page). Google penalizes fabricated review counts.
6. **Confirm free trial length (P1).** Code has been updated to say 14 days everywhere. If the correct trial length is 30 days, all references need to be reverted. Affected files: page.tsx (FAQ schema), waitlist/layout.tsx (title/description), llms.txt.
7. **Submit to HSTS preload list (P3).** After domain redirect is fixed and stable for 1 week, submit getacuity.io to hstspreload.org.
8. **Run Lighthouse audits (P2).** Run `npx lighthouse` on /, /voice-journaling, /for/therapy, /blog/voice-journaling-app to get actual CWV scores.

## Issues discovered during implementation (not in original audit)

1. **Blog post text strings use curly/smart quotes.** When adding internal links to blog-posts.ts, template literals were required instead of double-quoted strings to avoid SWC parser errors with escaped quotes inside smart-quote text. Future edits to blog-posts.ts should use template literals for any text containing HTML.
2. **4 pre-existing test failures in auth-flows.test.ts.** `prisma.deletedUser.findFirst is not a function` — unrelated to SEO, likely a missing Prisma model mock. These failures exist on main independently.
3. **No `next/image` config in next.config.js.** The `images` configuration is using Next.js defaults. If external image domains are needed in the future (e.g., for blog post hero images from a CMS), an `images.remotePatterns` config will be needed.

## Items intentionally deferred

1. **Create /about page with E-E-A-T signals (P1).** An about page with founder bios, company mission, and credentials would strengthen E-E-A-T for both Google and AI search engines. Deferred because it requires Keenan to provide founder bio copy, team photos, and company story.
2. **Create /pricing standalone page (P2).** Would target "Acuity pricing" queries. Deferred because pricing info is already embedded in homepage and /for/ pages.
3. **Page-specific OG images for /for/ pages (P2).** Each /for/ page currently shares the generic og-image.png. Custom OG images would improve social CTR. Requires design work.
4. **Convert /for/ pages from client to server components (P2).** All /for/ pages are "use client" due to interactive elements (ParallaxOrbs, animations, hover effects). Converting to server components would require extracting all interactive elements into separate client components — significant refactor with marginal SEO benefit.
5. **Homepage force-dynamic removal (P1).** The homepage uses `export const dynamic = "force-dynamic"` because it checks auth and redirects logged-in users. Moving this to middleware would allow static generation. Deferred because it requires careful middleware testing to avoid auth regressions.
6. **Purple accent color contrast (#7C5CFC on dark backgrounds).** At 4.5:1, this is borderline WCAG AA. However, it's used primarily on interactive elements (buttons, links) where the 3:1 large text ratio applies, and changing the brand color requires design approval.
7. **Comprehensive focus state audit across all components.** Focus-visible styles were added to the PulsingCTA and nav dropdown trigger. A full audit of all interactive elements across the app is still needed.
8. **FAQPage schema on /for/ pages (P2).** Each /for/ page has a visible FAQ section but no FAQPage structured data. Adding it would enable FAQ rich results for those pages.

## Self-grade

**New grade: B+**

The three P0 issues (noindex, sitemap gaps, canonical inconsistency) are fully resolved in code. The site now has 39+ indexable URLs in the sitemap (was 17), all /for/ pages are visible to search engines, canonicals are consistent, and AI search engines have explicit crawl permission plus an llms.txt file. Structured data is hardened with WebSite schema, BreadcrumbList on all /for/ pages, verified BlogPosting schemas, and the risky aggregateRating removed. Internal linking now connects blog content to /for/ angle pages bidirectionally, and a related posts module increases session depth.

The gap between B+ and A is primarily the Vercel domain redirect (P0 manual step that only Keenan can fix), the missing /about page for E-E-A-T, empty sameAs in Organization schema (waiting on social URLs from Keenan), and the homepage force-dynamic TTFB issue. Once Keenan completes the manual steps, the site would grade A-.
