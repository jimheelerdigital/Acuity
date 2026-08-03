/**
 * Content Factory — brand constants (single source of truth).
 *
 * VISUAL_DNA describes the coral-first palette + aesthetic guardrails
 * for image generation prompts. STYLE_LANES define 7 named visual
 * treatments that keep the carousel feed varied while staying on-brand.
 */

// ─── Visual DNA ────────────────────────────────────────────────────────────────
// Appended to every image-generation prompt so the output is recognizably Ripple.

/**
 * Base visual instructions appended to every image prompt.
 * The color scheme is injected separately per carousel via COLOR_SCHEMES.
 */
export const VISUAL_DNA = [
  "Mood: gentle, reflective, warm — like golden-hour light through a window.",
  "Lighting: soft diffused or golden-hour. No harsh flash, no clinical white.",
  "Human subjects: diverse women ~35-50, natural expressions, candid not posed.",
  "Composition: clean negative space, editorial simplicity, slightly aspirational.",
  "Absolutely NO text, letters, words, numbers, watermarks, or logos in the image.",
  "No corporate stock-photo energy. No laptop-and-latte clichés.",
].join("\n");

/**
 * Color schemes — one is picked per carousel so all slides in a carousel
 * share a cohesive palette, but each carousel looks distinct.
 */
export const COLOR_SCHEMES = [
  {
    name: "coral-cream",
    prompt: "Dominant color palette: warm coral (#F97E4E) and soft cream (#FBFAF6). Accents of warm amber. Warm, energetic, inviting.",
  },
  {
    name: "indigo-cream",
    prompt: "Dominant color palette: muted indigo (#3D3A50) and soft cream (#FBFAF6). Accents of dusty rose. Deep, introspective, evening calm.",
  },
  {
    name: "dusty-rose",
    prompt: "Dominant color palette: dusty rose (#D4918A) and warm tan (#F0E6D6). Accents of coral. Soft, feminine, tender warmth.",
  },
  {
    name: "amber-tan",
    prompt: "Dominant color palette: warm amber (#D4A76A) and cream (#FBFAF6). Accents of sage green. Golden-hour nostalgia, comforting.",
  },
  {
    name: "sage-cream",
    prompt: "Dominant color palette: sage green (#8FA88B) and soft cream (#FBFAF6). Accents of warm amber. Fresh, balanced, renewal.",
  },
  {
    name: "deep-purple",
    prompt: "Dominant color palette: deep purple (#5B4A7A) and dusty rose (#D4918A). Accents of cream. Moody, reflective, rich depth.",
  },
];

// ─── Style Lanes ───────────────────────────────────────────────────────────────
// Each lane is a prompt prefix that steers the visual treatment. Topics reference
// lanes by key so the feed stays varied across cinematicReal, toon3d, etc.

export const STYLE_LANES = {
  cinematicReal: "Cinematic photorealistic scene, shallow depth of field, film grain, warm color grading.",
  toon3d: "Soft 3D render in the style of Pixar/DreamWorks, rounded shapes, warm subsurface lighting.",
  claymation: "Claymation stop-motion aesthetic, handmade textures, warm studio lighting, soft shadows.",
  stillLife: "Editorial still-life photograph, carefully arranged objects, soft natural light, overhead or 45° angle.",
  flatGraphic: "Flat vector illustration, limited warm color palette, bold simple shapes, editorial magazine style.",
  paperDiorama: "Paper-craft diorama scene, layered cut-paper with soft shadows, handmade craft aesthetic.",
  risograph: "Risograph print aesthetic, halftone dots, limited 3-color palette (coral, indigo, cream), slight misregistration.",
} as const;

export type StyleLane = keyof typeof STYLE_LANES;
