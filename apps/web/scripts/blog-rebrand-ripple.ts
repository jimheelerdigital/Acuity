/**
 * One-time rebrand sweep: replace the dead "Acuity" product name with
 * "Ripple" in every live blog post (title, hook, cta, body, finalBody).
 *
 * Word-boundary, case-sensitive match — "Acuity" the product, never
 * "mental acuity" prose. Pings IndexNow for every changed URL.
 *
 * Run: npx dotenv -e apps/web/.env.local -- tsx apps/web/scripts/blog-rebrand-ripple.ts
 */
import { prisma } from "../src/lib/prisma";
import { notifyPublish } from "../src/lib/google/indexing";

const RE = /\bAcuity\b/g;

async function main() {
  const posts = await prisma.contentPiece.findMany({
    where: {
      type: "BLOG",
      slug: { not: null },
      status: { in: ["DISTRIBUTED", "AUTO_PUBLISHED"] },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      hook: true,
      cta: true,
      body: true,
      finalBody: true,
    },
  });

  let changed = 0;
  for (const p of posts) {
    const next = {
      title: p.title.replace(RE, "Ripple"),
      hook: p.hook.replace(RE, "Ripple"),
      cta: p.cta.replace(RE, "Ripple"),
      body: p.body.replace(RE, "Ripple"),
      finalBody: p.finalBody ? p.finalBody.replace(RE, "Ripple") : null,
    };
    const dirty =
      next.title !== p.title ||
      next.hook !== p.hook ||
      next.cta !== p.cta ||
      next.body !== p.body ||
      next.finalBody !== p.finalBody;
    if (!dirty) continue;

    await prisma.contentPiece.update({ where: { id: p.id }, data: next });
    changed++;
    const url = `https://goripple.io/blog/${p.slug}`;
    const res = await notifyPublish(url);
    console.log(
      `rebranded ${p.slug}${next.title !== p.title ? " [TITLE]" : ""} indexnow=${res.success}`
    );
  }
  console.log(`\nDone: ${changed}/${posts.length} posts rebranded`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
