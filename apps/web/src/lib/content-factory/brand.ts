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
  "This is a social media carousel slide. Text and illustration are one cohesive designed composition.",
  "Style: illustrated graphic design — NOT a photo with text overlaid.",
  "Text rendering rules (CRITICAL):",
  "  • Text must be LARGE and BOLD — a prominent design element, like a magazine headline. Never tiny or tucked into a corner.",
  "  • Clean, bold sans-serif font. Every single letter must be perfectly crisp and readable.",
  "  • Spell every word EXACTLY as provided — no omissions, no extra words, no substitutions, no abbreviations.",
  "  • High contrast between text and background — dark text on light areas or light text on dark areas.",
  "  • No warping, no curving, no stylized distortion of text. Straight, clean, horizontal lines only.",
  "Illustration elements: warm, editorial, hand-drawn or soft 3D feel. Relevant visual metaphors that fill the majority of the slide.",
  "Human subjects when included: diverse women ~35-50, illustrated style (not photorealistic), natural expressions.",
  "Mood: gentle, reflective, warm. No corporate stock-photo energy.",
  "Layout: 9:16 portrait. Illustrations should be the visual hero. Text is integrated but not dominant.",
  "NO watermarks, NO logos, NO extra text beyond what is specified.",
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
