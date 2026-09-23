/**
 * Shared slug utilities for blog post URL generation.
 * Used by both the manual approve route and the auto-blog pipeline.
 */

export function slugify(title: string): string {
  const full = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (full.length <= 60) return full;
  // Truncate at a word boundary instead of mid-word ("...why-self-recorded"
  // → "...why-self"). Existing slugs are unaffected; this only shapes new ones.
  const cut = full.slice(0, 60);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > 30 ? cut.slice(0, lastDash) : cut).replace(/-+$/, "");
}

export async function uniqueSlug(
  prisma: {
    contentPiece: {
      findUnique: (args: {
        where: { slug: string };
      }) => Promise<unknown>;
    };
  },
  base: string
): Promise<string> {
  let slug = base;
  let suffix = 2;
  while (await prisma.contentPiece.findUnique({ where: { slug } })) {
    slug = `${base.slice(0, 56)}-${suffix}`;
    suffix++;
  }
  return slug;
}
