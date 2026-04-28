/**
 * Shared slug utilities for blog post URL generation.
 * Used by both the manual approve route and the auto-blog pipeline.
 */

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
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
