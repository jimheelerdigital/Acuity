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
  "This is a premium social media carousel slide. It should look like it was made by a top-tier creative agency — polished, high-class, editorial quality.",
  "The text and illustration must BLEND together as one seamless composition. Vary the layout creatively every time:",
  "  • Text can flow on the left with illustration on the right, or vice versa",
  "  • Text can wrap around a central illustration",
  "  • Text can be stacked at the top with illustration below",
  "  • Text can be integrated throughout the scene with elements weaving between lines",
  "  • Be creative with placement — never feel formulaic or templated",
  "TEXT: Bold, clean sans-serif. Perfectly crisp and readable. Use visual hierarchy — key words or numbers can be larger. Spell every word EXACTLY as provided. No warping or distortion.",
  "ILLUSTRATION: Warm editorial illustration, hand-drawn feel. Diverse women ~35-50, natural expressions. Rich details — plants, candles, mugs, books, sticky notes, cozy domestic elements. Muted warm tones.",
  "QUALITY: Every slide should feel like a page from a premium wellness magazine. Clean, intentional, sophisticated. Not cluttered, not cheap, not templated.",
  "9:16 portrait format. NO watermarks, NO logos, NO extra text beyond what is specified.",
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
  cinematicReal: "Illustrated graphic with soft realistic elements, warm editorial feel, gentle gradients.",
  toon3d: "Soft 3D illustrated graphic, rounded shapes, warm lighting, Pixar-inspired characters and props.",
  claymation: "Illustrated graphic with handmade clay-like textures, soft shadows, tactile warmth.",
  stillLife: "Illustrated graphic with editorial still-life objects arranged around the text, clean layout.",
  flatGraphic: "Bold flat vector illustration, clean geometric shapes, strong graphic design composition.",
  paperDiorama: "Illustrated graphic with layered paper-craft elements, cut-paper textures, depth through layers.",
  risograph: "Illustrated graphic with halftone dot textures, limited color palette, slight retro print feel.",
} as const;

export type StyleLane = keyof typeof STYLE_LANES;
